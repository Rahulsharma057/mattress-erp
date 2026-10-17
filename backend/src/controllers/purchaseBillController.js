const asyncHandler = require("express-async-handler");
const PurchaseBill = require("../models/PurchaseBill");
const Voucher = require("../models/Voucher");
const Ledger = require("../models/Ledger");
const StockTransaction = require("../models/StockTransaction");
const { postPurchaseBillAccounting } = require("../services/accountingPostings");
const { computeLineAmounts } = require("../utils/billCalc");
const { resolvePartyState } = require("../utils/gstSplit");
const generateBillNumber = require("../utils/generateBillNumber");
const withTransaction = require("../utils/withTransaction");
const ItemVariant = require("../models/ItemVariant");
const { getOrCreateVariant, applyVariantStockDelta } = require("../services/itemVariants");
const paginate = require("../utils/paginate");

// Resolves the ItemVariant for every incoming line BEFORE tax/total calculation, so `variant`
// rides along through computeLineAmounts's `{...line, amount}` spread and ends up stored on
// the saved bill. If the line names an EXISTING variant explicitly (the user picked one
// already on file), that one is used as-is - never silently re-derived from dimensions, which
// would ignore the user's choice. Otherwise (no variant id - a brand-new or "unknown for now"
// specification), it's resolved/created from whatever dimensions were given, per
// services/itemVariants - this is the one place Purchase may register a size Sales never can.
const resolveLineVariants = async (items) => Promise.all((items || []).map(async (line) => {
  if (line.variant) {
    const variant = await ItemVariant.findById(line.variant);
    if (!variant || String(variant.item) !== String(line.item)) {
      throw new Error("Selected specification does not belong to this item");
    }
    return { ...line, variant: variant._id };
  }
  const variant = await getOrCreateVariant({
    item: line.item, length: line.length, width: line.width,
    thickness: line.thickness, density: line.density, unit: line.unit,
  });
  return { ...line, variant: variant._id };
}));

// @desc Create a Purchase Bill / Purchase Order. Increases stock for confirmed bills and
//       posts real double-entry accounting (Dr Purchase Account + Dr Input CGST/SGST/IGST,
//       Cr Supplier) - see services/accountingPostings.
const createPurchaseBill = asyncHandler(async (req, res) => {
  const { billType = "purchase_bill", supplier, items, date } = req.body;

  if (!items || items.length === 0) {
    res.status(400);
    throw new Error("At least one item line is required");
  }

  // Needed for the correct GST split (CGST+SGST for intra-state vs IGST for inter-state -
  // see utils/gstSplit; an item's sgst/cgst/igst are alternatives for the same rate, not
  // three taxes to add together).
  const supplierLedger = await Ledger.findById(supplier);
  if (!supplierLedger) {
    res.status(400);
    throw new Error("Supplier/party not found");
  }

  // Resolve each line's specification into an ItemVariant BEFORE computing amounts, so
  // `variant` rides through computeLineAmounts and gets saved on the bill.
  let itemsWithVariant;
  try {
    itemsWithVariant = await resolveLineVariants(items);
  } catch (err) {
    res.status(400);
    throw err;
  }
  const { computed, totalAmount } = computeLineAmounts(itemsWithVariant, resolvePartyState(supplierLedger));
  const billNumber = await generateBillNumber(PurchaseBill, "PB");

  const bill = await withTransaction(async (session) => {
    const [created] = await PurchaseBill.create([{
      billNumber, billType, date, supplier, items: computed, totalAmount, createdBy: req.user._id,
    }], { session });

    if (billType !== "purchase_order") {
      for (const line of computed) {
        await applyVariantStockDelta(line.variant, line.item, line.quantity, session);
        await StockTransaction.create([{
          type: "purchase_in", item: line.item, variant: line.variant, quantity: line.quantity,
          remarks: `Purchased via ${billNumber}`, createdBy: req.user._id,
        }], { session });
      }
      await postPurchaseBillAccounting({ partyId: supplier, items: computed, totalAmount }, { session });
    }

    return created;
  });

  res.status(201).json(bill);
});

// @desc List Purchase Bills. No `page` param keeps the old plain-array shape (existing
//       callers unaffected); the Purchase screen passes page/limit/search explicitly for a
//       real paginated, server-searched page - same pattern as getSalesBills.
// @route GET /api/purchase?supplier=&paymentStatus=&search=&page=&limit=
const getPurchaseBills = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.supplier) filter.supplier = req.query.supplier;
  if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;

  if (req.query.search) {
    const safe = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(safe, "i");
    const matchingSuppliers = await Ledger.find({ name: re }).select("_id");
    filter.$or = [{ billNumber: re }, { supplier: { $in: matchingSuppliers.map((s) => s._id) } }];
  }

  const query = PurchaseBill.find(filter)
    .populate("supplier", "name mobile")
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

// @desc Mirror of salesBillController.getSalesBillPayments for the payable side - every
//       posted Payment voucher that allocated any amount against THIS purchase bill.
// @route GET /api/purchase/:id/payments
const getPurchaseBillPayments = asyncHandler(async (req, res) => {
  const vouchers = await Voucher.find({ voucherType: "payment", "allocations.purchaseBill": req.params.id })
    .populate("counterLedger", "name")
    .sort({ date: -1 });

  const payments = vouchers.map((v) => {
    const allocation = (v.allocations || []).find((a) => String(a.purchaseBill) === String(req.params.id));
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

const updatePaymentStatus = asyncHandler(async (req, res) => {
  const bill = await PurchaseBill.findById(req.params.id);
  if (!bill) {
    res.status(404);
    throw new Error("Purchase bill not found");
  }
  bill.paymentStatus = req.body.paymentStatus;
  await bill.save();
  res.json(bill);
});

// @desc Confirm a Purchase Order into a real Purchase Bill (goods received) - this is what
//       actually increases stock and posts accounting; a Purchase Order on its own is only a
//       draft. Mirrors salesBillController.confirmSalesOrder.
// @route PUT /api/purchase/:id/confirm
const confirmPurchaseOrder = asyncHandler(async (req, res) => {
  const bill = await PurchaseBill.findById(req.params.id);
  if (!bill) {
    res.status(404);
    throw new Error("Purchase bill not found");
  }
  if (bill.billType !== "purchase_order") {
    res.status(400);
    throw new Error(`Only a Purchase Order can be confirmed into a bill - this is already a '${bill.billType}'`);
  }
  if (bill.status === "cancelled") {
    res.status(400);
    throw new Error("This purchase order is cancelled and cannot be confirmed");
  }

  await withTransaction(async (session) => {
    bill.billType = "purchase_bill";
    await bill.save({ session });

    for (const line of bill.items) {
      await applyVariantStockDelta(line.variant, line.item, line.quantity, session);
      await StockTransaction.create([{
        type: "purchase_in", item: line.item, variant: line.variant, quantity: line.quantity,
        remarks: `Purchased via ${bill.billNumber} (confirmed from Purchase Order)`, createdBy: req.user._id,
      }], { session });
    }
    await postPurchaseBillAccounting({ partyId: bill.supplier, items: bill.items, totalAmount: bill.totalAmount }, { session });
  });

  res.json(bill);
});

// @desc Cancel a confirmed Purchase Bill - reverses stock and every ledger leg that was
//       originally posted (Purchase Account, Input taxes, Supplier). Mirrors
//       salesBillController.cancelSalesBill. A purchase_order draft never posted anything,
//       so cancelling one is just a status flip with no reversal needed.
// @route PUT /api/purchase/:id/cancel
const cancelPurchaseBill = asyncHandler(async (req, res) => {
  const bill = await PurchaseBill.findById(req.params.id);
  if (!bill) {
    res.status(404);
    throw new Error("Purchase bill not found");
  }
  if (bill.status === "cancelled") {
    res.status(400);
    throw new Error("Bill is already cancelled");
  }

  await withTransaction(async (session) => {
    if (bill.billType !== "purchase_order") {
      for (const line of bill.items) {
        await applyVariantStockDelta(line.variant, line.item, -line.quantity, session); // remove the stock that came in
        await StockTransaction.create([{
          type: "purchase_return", item: line.item, variant: line.variant, quantity: line.quantity,
          remarks: `Reversed - cancelled bill ${bill.billNumber}`, createdBy: req.user._id,
        }], { session });
      }
      await postPurchaseBillAccounting({ partyId: bill.supplier, items: bill.items, totalAmount: bill.totalAmount }, { reverse: true, session });
    }

    bill.status = "cancelled";
    await bill.save({ session });
  });

  res.json(bill);
});

module.exports = { createPurchaseBill, getPurchaseBills, getPurchaseBillPayments, updatePaymentStatus, confirmPurchaseOrder, cancelPurchaseBill };
