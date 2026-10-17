const asyncHandler = require("express-async-handler");
const SalesBill = require("../models/SalesBill");
const Voucher = require("../models/Voucher");
const Ledger = require("../models/Ledger");
const StockTransaction = require("../models/StockTransaction");
const ItemVariant = require("../models/ItemVariant");
const { postSalesBillAccounting } = require("../services/accountingPostings");
const { computeLineAmounts, round2 } = require("../utils/billCalc");
const { resolvePartyState } = require("../utils/gstSplit");
const generateBillNumber = require("../utils/generateBillNumber");
const withTransaction = require("../utils/withTransaction");
const { getOrCreateVariant, applyVariantStockDelta } = require("../services/itemVariants");
const paginate = require("../utils/paginate");
const { generateSalesInvoicePDF } = require("../services/pdfGenerator");
const { resolveBillTo } = require("../utils/billToSnapshot");

// Sales only ever SELLS a specification that already exists in stock - it never invents a new
// one (that's Purchase/Work Order's job). If the line didn't name a variant at all (an item
// with no sized stock yet, or a caller that predates variants), it falls back to that item's
// single "Unspecified" bucket, which correctly has zero stock until something is received
// into it - so this never silently lets a sale through unchecked.
const resolveLineVariant = async (line) => {
  if (line.variant) {
    const variant = await ItemVariant.findById(line.variant);
    if (!variant || String(variant.item) !== String(line.item)) {
      throw new Error(`Selected specification does not belong to this item`);
    }
    return variant;
  }
  return getOrCreateVariant({ item: line.item });
};

// Roles trusted to confirm a credit sale past the dealer's available credit. A salesman can
// never do this from their own request, no matter what the request body claims - that check
// is on req.user.role, not on anything the client sends.
const CREDIT_OVERRIDE_ROLES = ["super_admin", "admin", "accountant"];

// @desc Create a Sales Bill / Sale Order / Cash Sale. Deducts stock for confirmed bills and
//       posts real double-entry accounting (see services/accountingPostings) - not just a
//       single balance bump on the dealer's ledger.
const createSalesBill = asyncHandler(async (req, res) => {
  const { billType = "sales_bill", party, items, date, paymentMode, overrideCreditLimit, overrideReason } = req.body;
  const isCreditSale = billType === "sales_bill"; // cash_sale settles immediately; sale_order is a draft, neither touches the ledger

  if (!items || items.length === 0) {
    res.status(400);
    throw new Error("At least one item line is required");
  }

  // Look up the dealer FIRST - used for the correct GST split (CGST+SGST for intra-state vs
  // IGST for inter-state - see utils/gstSplit; an item's sgst/cgst/igst are alternatives for
  // the same rate, not three taxes to add together), the credit check below, AND to
  // auto-assign the salesman, not just for credit sales, so an admin creating a cash sale or
  // sale order on a dealer's behalf still correctly attributes it to that dealer's salesman.
  const dealer = await Ledger.findById(party);
  if (!dealer) {
    res.status(400);
    throw new Error("Dealer/party not found");
  }

  // Resolve each line's exact specification BEFORE computing amounts, so `variant` rides
  // through computeLineAmounts's spread and ends up stored on the bill.
  const itemsWithVariant = await Promise.all(items.map(async (line) => {
    const variant = await resolveLineVariant(line);
    return { ...line, variant: variant._id, _variantDoc: variant };
  }));
  const { computed, totalAmount } = computeLineAmounts(itemsWithVariant, resolvePartyState(dealer));

  // Block overselling: a confirmed bill (not a draft sale order) must not take any
  // SPECIFIC SIZE's stock negative - checking only the item's total would let a sale of size
  // A silently draw down size B's stock as long as the item's combined total looked
  // sufficient, which is exactly the "merged stock" bug this variant system exists to prevent.
  if (billType !== "sale_order") {
    for (const line of itemsWithVariant) {
      const variant = line._variantDoc;
      if (variant.stockQty < line.quantity) {
        res.status(400);
        throw new Error(`Insufficient stock for this specification (${variant.sizeLabel}): available ${variant.stockQty}, requested ${line.quantity}`);
      }
    }
  }

  // Credit limit check - only a true credit sale increases the dealer's outstanding.
  // Available credit = creditLimit - currentBalance (currentBalance already reflects every
  // posted sale/receipt/note so far; this new bill hasn't posted yet).
  let creditOverride;
  if (isCreditSale) {
    const creditLimit = dealer.creditLimit || 0;
    const available = creditLimit - (dealer.currentBalance || 0);
    if (creditLimit > 0 && totalAmount > available) {
      if (!overrideCreditLimit) {
        res.status(409);
        throw new Error(`Credit limit exceeded for "${dealer.name}": available credit is ₹${available}, this bill is ₹${totalAmount}. An authorized user can override to proceed.`);
      }
      if (!CREDIT_OVERRIDE_ROLES.includes(req.user.role)) {
        res.status(403);
        throw new Error("Only an Accountant, Admin, or Super Admin can override the credit limit");
      }
      creditOverride = { overriddenBy: req.user._id, reason: overrideReason, overriddenAt: new Date() };
    }
  }

  const billNumber = await generateBillNumber(SalesBill, "SB");

  // Salesman is auto-set to the logged-in user if they are a salesman; an admin/super_admin
  // may pass a salesman explicitly to override, but otherwise this now falls back to the
  // DEALER's own assigned salesman (Ledger.salesman) - previously an admin-created bill left
  // `salesman` empty unless the frontend happened to send one, so the sale silently never
  // showed up anywhere in that salesman's app even though the dealer was assigned to them.
  const salesman = req.user.role === "salesman" ? req.user._id : (req.body.salesman || dealer.salesman);

  // Bill creation, stock deduction, and every ledger leg all commit together or not at all -
  // a crash partway through (e.g. after stock but before the accounting posting) can never
  // leave the books half-updated. Requires a replica set; MongoDB Atlas is one by default.
  // Frozen at creation time so a later edit to this dealer's Ledger record never rewrites
  // this invoice's Bill To details - see the field comment on SalesBill.billingSnapshot.
  const billingSnapshot = {
    name: dealer.name, dealerCode: dealer.dealerCode, address: dealer.address,
    city: dealer.city, state: dealer.state, pincode: dealer.pincode,
    gstin: dealer.gstin, mobile: dealer.mobile,
  };

  const bill = await withTransaction(async (session) => {
    const [created] = await SalesBill.create([{
      billNumber, billType, date, party, salesman, items: computed, totalAmount,
      status: "confirmed", createdBy: req.user._id,
      paymentMode: billType === "cash_sale" ? (paymentMode || "cash") : undefined,
      creditOverride, billingSnapshot,
    }], { session });

    // Deduct stock for each line + log stock transactions (skip for draft sale orders)
    if (billType !== "sale_order") {
      for (const line of computed) {
        await applyVariantStockDelta(line.variant, line.item, -line.quantity, session);
        await StockTransaction.create([{
          type: "sale_out", item: line.item, variant: line.variant, quantity: line.quantity,
          remarks: `Sold via ${billNumber}`, createdBy: req.user._id,
        }], { session });
      }
      // Real double-entry: Dr Customer (or Cash/Bank for a cash sale), Cr Sales Account,
      // Cr Output CGST/SGST/IGST - see services/accountingPostings.
      await postSalesBillAccounting({
        partyId: party, items: computed, totalAmount,
        isCashSale: billType === "cash_sale", paymentMode,
      }, { session });
    }

    return created;
  });

  res.status(201).json(bill);
});

// @desc List Sales Bills. Every existing caller (dashboard cards, dispatch screen, etc.)
//       calls this with no `page` - it keeps the old plain-array shape, capped at a sane
//       limit, so none of those had to change. The Sales screen passes `page`/`limit`/
//       `search` explicitly and gets back a real paginated, server-searched page instead.
// @route GET /api/sales?party=&salesman=&status=&search=&page=&limit=
const getSalesBills = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.party) filter.party = req.query.party;
  if (req.query.salesman) filter.salesman = req.query.salesman;
  if (req.query.status) filter.status = req.query.status;
  // Salesmen only ever see their own bills
  if (req.user.role === "salesman") filter.salesman = req.user._id;

  if (req.query.search) {
    const safe = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(safe, "i");
    // billNumber matches directly; party name needs its own lookup first since Mongo can't
    // regex-match a populated field in the same find().
    const matchingParties = await Ledger.find({ name: re }).select("_id");
    filter.$or = [{ billNumber: re }, { party: { $in: matchingParties.map((p) => p._id) } }];
  }

  const query = SalesBill.find(filter)
    .populate("party", "name mobile")
    .populate("salesman", "name")
    .populate("items.item", "name unit")
    .populate("items.variant", "sizeLabel")
    .sort({ date: -1 });

  if (!req.query.page) {
    const bills = await query.limit(500);
    return res.json(bills);
  }

  const { data, pagination } = await paginate(query, req.query);
  res.json({ bills: data, pagination });
});

// `items.item` also carries its HSN code/short name (nested populate) - needed for the full
// item-wise Sales Invoice view/PDF (HSN is a required column there), not previously fetched
// since no screen showed line items before. `billTo` is additive (see resolveBillTo above) -
// `party` stays exactly as before for anything already reading it.
const getSalesBillById = asyncHandler(async (req, res) => {
  const bill = await SalesBill.findById(req.params.id)
    .populate("party").populate("salesman", "name")
    .populate({ path: "items.item", select: "name unit productCode hsn", populate: { path: "hsn", select: "code shortName" } })
    .populate("items.variant", "sizeLabel isUnspecified");
  if (!bill) {
    res.status(404);
    throw new Error("Sales bill not found");
  }
  res.json({ ...bill.toObject(), billTo: resolveBillTo(bill) });
});

// Shared with getSalesBillPayments below - total actually received against this bill so far,
// from real posted Receipt vouchers only (never estimated or assumed from totalAmount).
const sumReceivedForBill = async (billId) => {
  const vouchers = await Voucher.find({ voucherType: "receipt", "allocations.salesBill": billId });
  return vouchers.reduce((sum, v) => {
    const allocation = (v.allocations || []).find((a) => String(a.salesBill) === String(billId));
    return sum + (allocation?.amount || 0);
  }, 0);
};

// @desc Payment history for one Sales Bill - every posted Receipt voucher that allocated any
//       amount against THIS invoice specifically, with a printable receipt for each (see
//       voucherController.getVoucherReceipt). A receipt that covers several invoices at once
//       shows up on every one of them, but only with the slice actually allocated here - not
//       its full amount - so adding these up can never overstate what this invoice received.
// @route GET /api/sales/:id/payments
const getSalesBillPayments = asyncHandler(async (req, res) => {
  const vouchers = await Voucher.find({ voucherType: "receipt", "allocations.salesBill": req.params.id })
    .populate("counterLedger", "name")
    .sort({ date: -1 });

  const payments = vouchers.map((v) => {
    const allocation = (v.allocations || []).find((a) => String(a.salesBill) === String(req.params.id));
    return {
      _id: v._id,
      voucherNumber: v.voucherNumber,
      date: v.date,
      amount: allocation?.amount || 0,
      paymentMode: v.paymentMode,
      account: v.counterLedger?.name || "-",
      referenceNumber: v.referenceNumber,
    };
  });
  res.json(payments);
});

// @desc Download/print the full item-wise Sales Invoice PDF - the Sales Bill itself (every
//       line item, HSN, qty/rate/GST breakdown, grand total, amount paid, balance due), NOT
//       the Receipt Voucher (that stays as-is, see voucherController.getVoucherReceipt - it
//       only ever shows a single payment's amount/narration, never product lines). Read-only:
//       never creates or modifies a bill or voucher.
// @route GET /api/sales/:id/invoice
const getSalesBillInvoice = asyncHandler(async (req, res) => {
  const bill = await SalesBill.findById(req.params.id)
    .populate("party")
    .populate({ path: "items.item", select: "name unit productCode hsn", populate: { path: "hsn", select: "code shortName" } })
    .populate("items.variant", "sizeLabel isUnspecified");
  if (!bill) {
    res.status(404);
    throw new Error("Sales bill not found");
  }

  const amountPaid = await sumReceivedForBill(bill._id);
  const balanceDue = round2(bill.totalAmount - amountPaid);

  const pdfBuffer = await generateSalesInvoicePDF(bill, { partyDetails: resolveBillTo(bill), amountPaid, balanceDue });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${bill.billNumber}.pdf"`);
  res.send(pdfBuffer);
});

// @desc Confirm a Sale Order into a real bill (Sales Bill by default, or a Cash Sale) - this
//       is what actually deducts stock and posts accounting; a Sale Order on its own is only
//       a draft with no such effect. Previously there was no way to do this at all: a Sale
//       Order just sat forever with no path to becoming a real bill.
// @route PUT /api/sales/:id/confirm
// @body { asCashSale?, paymentMode?, overrideCreditLimit?, overrideReason? }
const confirmSalesOrder = asyncHandler(async (req, res) => {
  const bill = await SalesBill.findById(req.params.id);
  if (!bill) {
    res.status(404);
    throw new Error("Sales bill not found");
  }
  if (bill.billType !== "sale_order") {
    res.status(400);
    throw new Error(`Only a Sale Order can be confirmed into a bill - this is already a '${bill.billType}'`);
  }
  if (bill.status === "cancelled") {
    res.status(400);
    throw new Error("This sale order is cancelled and cannot be confirmed");
  }

  const { asCashSale, paymentMode, overrideCreditLimit, overrideReason } = req.body;
  const targetBillType = asCashSale ? "cash_sale" : "sales_bill";

  // Re-check stock sufficiency NOW, against the exact same specification this order was
  // drafted for - it may well have moved since then.
  for (const line of bill.items) {
    const variant = await ItemVariant.findById(line.variant);
    if (!variant) {
      res.status(400);
      throw new Error(`Specification not found for one of this order's lines`);
    }
    if (variant.stockQty < line.quantity) {
      res.status(400);
      throw new Error(`Insufficient stock for this specification (${variant.sizeLabel}): available ${variant.stockQty}, requested ${line.quantity}`);
    }
  }

  let creditOverride;
  if (targetBillType === "sales_bill") {
    const dealer = await Ledger.findById(bill.party);
    if (!dealer) {
      res.status(400);
      throw new Error("Dealer/party not found");
    }
    const creditLimit = dealer.creditLimit || 0;
    const available = creditLimit - (dealer.currentBalance || 0);
    if (creditLimit > 0 && bill.totalAmount > available) {
      if (!overrideCreditLimit) {
        res.status(409);
        throw new Error(`Credit limit exceeded for "${dealer.name}": available credit is ₹${available}, this order is ₹${bill.totalAmount}. An authorized user can override to proceed.`);
      }
      if (!CREDIT_OVERRIDE_ROLES.includes(req.user.role)) {
        res.status(403);
        throw new Error("Only an Accountant, Admin, or Super Admin can override the credit limit");
      }
      creditOverride = { overriddenBy: req.user._id, reason: overrideReason, overriddenAt: new Date() };
    }
  }

  await withTransaction(async (session) => {
    bill.billType = targetBillType;
    bill.paymentMode = targetBillType === "cash_sale" ? (paymentMode || "cash") : undefined;
    bill.creditOverride = creditOverride;
    await bill.save({ session });

    for (const line of bill.items) {
      await applyVariantStockDelta(line.variant, line.item, -line.quantity, session);
      await StockTransaction.create([{
        type: "sale_out", item: line.item, variant: line.variant, quantity: line.quantity,
        remarks: `Sold via ${bill.billNumber} (confirmed from Sale Order)`, createdBy: req.user._id,
      }], { session });
    }
    await postSalesBillAccounting({
      partyId: bill.party, items: bill.items, totalAmount: bill.totalAmount,
      isCashSale: targetBillType === "cash_sale", paymentMode,
    }, { session });
  });

  res.json(bill);
});

// @desc Cancel a confirmed bill - reverses stock deduction and every ledger leg that was
//       originally posted (customer/cash, Sales Account, Output taxes), not just the party.
const cancelSalesBill = asyncHandler(async (req, res) => {
  const bill = await SalesBill.findById(req.params.id);
  if (!bill) {
    res.status(404);
    throw new Error("Sales bill not found");
  }
  if (bill.status === "cancelled") {
    res.status(400);
    throw new Error("Bill is already cancelled");
  }

  await withTransaction(async (session) => {
    if (bill.status === "confirmed" || bill.status === "modified") {
      for (const line of bill.items) {
        await applyVariantStockDelta(line.variant, line.item, line.quantity, session); // add stock back
        await StockTransaction.create([{
          type: "receive", item: line.item, variant: line.variant, quantity: line.quantity,
          remarks: `Reversed - cancelled bill ${bill.billNumber}`, createdBy: req.user._id,
        }], { session });
      }
      // Reverse the exact same postings made at creation (Sales Account, Output taxes, and
      // the customer or Cash/Bank leg) - never just the party side.
      await postSalesBillAccounting({
        partyId: bill.party, items: bill.items, totalAmount: bill.totalAmount,
        isCashSale: bill.billType === "cash_sale", paymentMode: bill.paymentMode,
      }, { reverse: true, session });
    }

    bill.status = "cancelled";
    await bill.save({ session });
  });

  res.json(bill);
});

module.exports = { createSalesBill, getSalesBills, getSalesBillById, getSalesBillPayments, getSalesBillInvoice, confirmSalesOrder, cancelSalesBill };
