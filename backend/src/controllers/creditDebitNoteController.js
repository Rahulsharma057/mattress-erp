const asyncHandler = require("express-async-handler");
const Voucher = require("../models/Voucher");
const ItemVariant = require("../models/ItemVariant");
const Ledger = require("../models/Ledger");
const StockTransaction = require("../models/StockTransaction");
const SalesBill = require("../models/SalesBill");
const PurchaseBill = require("../models/PurchaseBill");
const generateBillNumber = require("../utils/generateBillNumber");
const { computeLineAmounts } = require("../utils/billCalc");
const { resolvePartyState } = require("../utils/gstSplit");
const { postSalesBillAccounting, postPurchaseBillAccounting } = require("../services/accountingPostings");
const { getOrCreateVariant, applyVariantStockDelta } = require("../services/itemVariants");
const withTransaction = require("../utils/withTransaction");
const { resolveLineVariantFromBill, checkReturnableQuantity } = require("../utils/creditDebitNoteLines");

// Small shared helper so every stock movement in this file is logged the same way.
// `quantity` is logged as a positive magnitude regardless of qtyDelta's sign (matching every
// other StockTransaction in the app); `remarks` is explicit so the log always reads clearly
// instead of being inferred from `type` (which broke down for the cancel paths - reversing a
// credit note's stock-in isn't itself a "purchase return", for example). Moves the SAME
// specification the line names (see models/ItemVariant.js) - a return must land back in, or
// come back out of, the exact size bucket it originally moved through.
const applyStockDeltaAndLog = async (line, { type, remarks }, userId, qtyDelta, session) => {
  await applyVariantStockDelta(line.variant, line.item, qtyDelta, session);
  await StockTransaction.create([{
    type, item: line.item, variant: line.variant, quantity: Math.abs(line.quantity), remarks, createdBy: userId,
  }], { session });
};

// A Credit/Debit Note tied to a referenced bill must return the EXACT specification that was
// originally billed - never let the client pick a different one, and never guess by item id
// alone when the bill has more than one size of that item (see utils/creditDebitNoteLines.js
// for the real bug this fixes and why). A note not tied to any bill resolves/reuses the
// item's variant normally (an explicit one if given, else its "Unspecified" bucket), same
// fallback as a Sales Bill line with no variant selected - that branch has no DB-free
// equivalent since getOrCreateVariant itself reads/writes the database.
const resolveNoteLineVariant = async (line, bill) => {
  if (bill) return resolveLineVariantFromBill(line, bill.items);
  if (line.variant) return line.variant;
  const variant = await getOrCreateVariant({ item: line.item });
  return variant._id;
};

// @desc Guards against returning more than was ever billed, PER LINE (item+variant) - see
// utils/creditDebitNoteLines.checkReturnableQuantity. Sums every NON-cancelled note already
// posted against this bill (by voucherType, excluding one note's own id when re-checking it)
// and checks each line of the new request against billedQty - alreadyReturned for that EXACT
// specification. Prevents: submitting two credit notes that together over-return an invoice,
// a credit note that returns more than the sales bill ever had for that size, concurrent
// duplicate submissions, etc. `requestItems` must already carry a resolved `variant` (see
// resolveNoteLineVariant above) - call this AFTER resolving variants, not before.
const assertWithinReturnableQuantity = async ({ voucherType, referenceBill, billItems, requestItems, excludeVoucherId }) => {
  if (!referenceBill) return; // no bill reference - nothing to bound the return against

  const priorNotes = await Voucher.find({
    voucherType, referenceBill,
    ...(excludeVoucherId ? { _id: { $ne: excludeVoucherId } } : {}),
  });
  checkReturnableQuantity(billItems, priorNotes.map((n) => n.items || []), requestItems);
};

// @desc Credit Note - a customer returns goods (sales return). Reduces what they owe us and
//       brings the returned stock back in. This is the exact reverse of a Sales Bill's
//       posting (Dr Sales Account + Dr Output taxes, Cr Customer) - not just a flat credit to
//       the customer's balance with no revenue/tax reversal, which would leave Sales Account
//       and the GST output ledgers overstated after every return. Cumulative returns against
//       a referenced bill can never exceed what was actually billed (see
//       assertWithinReturnableQuantity).
// @route POST /api/accounts/credit-notes
// @body { party, items: [{item, quantity, rate, sgst?, cgst?, igst?}], salesBillRef?, remarks }
const createCreditNote = asyncHandler(async (req, res) => {
  const { party, items, salesBillRef, remarks } = req.body;

  // Needed for the correct GST split (CGST+SGST for intra-state vs IGST for inter-state -
  // see utils/gstSplit); an item's sgst/cgst/igst are alternatives for the same rate, not
  // three taxes to add together.
  const partyLedger = await Ledger.findById(party);
  if (!partyLedger) {
    res.status(400);
    throw new Error("Party not found");
  }

  let bill;
  if (salesBillRef) {
    bill = await SalesBill.findById(salesBillRef);
    if (!bill) {
      res.status(400);
      throw new Error("Referenced sales bill not found");
    }
    if (String(bill.party) !== String(party)) {
      res.status(400);
      throw new Error("The referenced sales bill does not belong to this party");
    }
  }

  // Resolve each line's EXACT specification first (needs the bill's own lines when
  // referenced - see resolveNoteLineVariant), then bound the quantity PER THAT SPECIFICATION,
  // not merged across every size of the item.
  let itemsWithVariant;
  try {
    itemsWithVariant = await Promise.all(items.map(async (line) => ({ ...line, variant: await resolveNoteLineVariant(line, bill) })));
    if (bill) {
      await assertWithinReturnableQuantity({ voucherType: "credit_note", referenceBill: salesBillRef, billItems: bill.items, requestItems: itemsWithVariant });
    }
  } catch (err) {
    res.status(400);
    throw err;
  }

  const { computed, totalAmount } = computeLineAmounts(itemsWithVariant, resolvePartyState(partyLedger));
  const voucherNumber = await generateBillNumber(Voucher, "CN", "voucherNumber");

  const voucher = await withTransaction(async (session) => {
    // The customer leg is a real Voucher (shows on the party's statement/ledger event feed);
    // `items` is stored too so a later cancellation can reverse the exact same
    // Sales Account/tax split and stock movement (see cancelCreditNote below).
    const [created] = await Voucher.create([{
      voucherType: "credit_note", voucherNumber, date: new Date(), ledger: party,
      amount: totalAmount, drCr: "credit", narration: remarks || "Sales return",
      referenceBill: salesBillRef, referenceModel: salesBillRef ? "SalesBill" : undefined,
      items: computed, source: "credit_note", createdBy: req.user._id,
    }], { session });
    await postSalesBillAccounting({ partyId: party, items: computed, totalAmount, isCashSale: false }, { reverse: true, session });

    for (const line of computed) {
      await applyStockDeltaAndLog(
        line, { type: "sales_return", remarks: `Sales return via ${voucherNumber}` }, req.user._id, line.quantity, session,
      );
    }

    return created;
  });

  res.status(201).json(voucher);
});

// @desc Debit Note - we return goods to a supplier (purchase return). Reduces what we owe
//       them and sends the returned stock back out. Exact reverse of a Purchase Bill's
//       posting (Cr Purchase Account + Cr Input taxes, Dr Supplier). Cumulative returns
//       against a referenced bill can never exceed what was actually purchased.
// @route POST /api/accounts/debit-notes
// @body { party, items: [{item, quantity, rate, sgst?, cgst?, igst?}], purchaseBillRef?, remarks }
const createDebitNote = asyncHandler(async (req, res) => {
  const { party, items, purchaseBillRef, remarks } = req.body;

  // Needed for the correct GST split (CGST+SGST for intra-state vs IGST for inter-state -
  // see utils/gstSplit); an item's sgst/cgst/igst are alternatives for the same rate, not
  // three taxes to add together.
  const partyLedger = await Ledger.findById(party);
  if (!partyLedger) {
    res.status(400);
    throw new Error("Party not found");
  }

  let bill;
  if (purchaseBillRef) {
    bill = await PurchaseBill.findById(purchaseBillRef);
    if (!bill) {
      res.status(400);
      throw new Error("Referenced purchase bill not found");
    }
    if (String(bill.supplier) !== String(party)) {
      res.status(400);
      throw new Error("The referenced purchase bill does not belong to this supplier");
    }
  }

  // Resolve each line to the EXACT specification it was originally purchased as (see
  // resolveNoteLineVariant), THEN bound the quantity PER THAT SPECIFICATION (not merged
  // across every size of the item) before checking it against THAT variant's actual stock.
  let itemsWithVariant;
  try {
    itemsWithVariant = await Promise.all(items.map(async (line) => ({ ...line, variant: await resolveNoteLineVariant(line, bill) })));
    if (bill) {
      await assertWithinReturnableQuantity({ voucherType: "debit_note", referenceBill: purchaseBillRef, billItems: bill.items, requestItems: itemsWithVariant });
    }
  } catch (err) {
    res.status(400);
    throw err;
  }
  for (const line of itemsWithVariant) {
    const variant = await ItemVariant.findById(line.variant);
    if (!variant) {
      res.status(400);
      throw new Error(`Specification not found for one of the returned items`);
    }
    if (variant.stockQty < line.quantity) {
      res.status(400);
      throw new Error(`Insufficient stock to return this specification (${variant.sizeLabel}): available ${variant.stockQty}, requested ${line.quantity}`);
    }
  }

  const { computed, totalAmount } = computeLineAmounts(itemsWithVariant, resolvePartyState(partyLedger));
  const voucherNumber = await generateBillNumber(Voucher, "DN", "voucherNumber");

  const voucher = await withTransaction(async (session) => {
    const [created] = await Voucher.create([{
      voucherType: "debit_note", voucherNumber, date: new Date(), ledger: party,
      amount: totalAmount, drCr: "debit", narration: remarks || "Purchase return",
      referenceBill: purchaseBillRef, referenceModel: purchaseBillRef ? "PurchaseBill" : undefined,
      items: computed, source: "debit_note", createdBy: req.user._id,
    }], { session });
    await postPurchaseBillAccounting({ partyId: party, items: computed, totalAmount }, { reverse: true, session });

    for (const line of computed) {
      await applyStockDeltaAndLog(
        line, { type: "purchase_return", remarks: `Purchase return via ${voucherNumber}` }, req.user._id, -line.quantity, session,
      );
    }

    return created;
  });

  res.status(201).json(voucher);
});

// @desc Cancel a Credit Note - reverses EVERY leg that createCreditNote posted: the customer
//       ledger, the Sales Account/Output GST split, AND the stock movement (goods that came
//       back in go back out). The generic voucherController.deleteVoucher cannot do this -
//       it only knows about `ledger`/`counterLedger`, and a credit note never uses
//       counterLedger (its extra legs post directly) - so it previously left Sales Account,
//       GST, and stock permanently wrong after a "delete". This is the dedicated fix.
// @route DELETE /api/accounts/credit-notes/:id
const cancelCreditNote = asyncHandler(async (req, res) => {
  const voucher = await Voucher.findById(req.params.id);
  if (!voucher || voucher.voucherType !== "credit_note") {
    res.status(404);
    throw new Error("Credit note not found");
  }

  await withTransaction(async (session) => {
    // Exact opposite of create: reverse:false here re-applies the normal Sales Bill
    // direction (Dr Customer, Cr Sales+GST), which is precisely what undoes a credit note
    // (which itself posted with reverse:true).
    await postSalesBillAccounting({ partyId: voucher.ledger, items: voucher.items, totalAmount: voucher.amount, isCashSale: false }, { session });
    for (const line of voucher.items) {
      await applyStockDeltaAndLog(
        line, { type: "stock_adjustment", remarks: `Credit note ${voucher.voucherNumber} cancelled - return reversed` }, req.user._id, -line.quantity, session,
      );
    }
    await voucher.deleteOne({ session });
  });

  res.json({ message: "Credit note cancelled - revenue, GST, receivable, and stock all reversed" });
});

// @desc Cancel a Debit Note - mirrors cancelCreditNote for the payable side.
// @route DELETE /api/accounts/debit-notes/:id
const cancelDebitNote = asyncHandler(async (req, res) => {
  const voucher = await Voucher.findById(req.params.id);
  if (!voucher || voucher.voucherType !== "debit_note") {
    res.status(404);
    throw new Error("Debit note not found");
  }

  await withTransaction(async (session) => {
    await postPurchaseBillAccounting({ partyId: voucher.ledger, items: voucher.items, totalAmount: voucher.amount }, { session });
    for (const line of voucher.items) {
      await applyStockDeltaAndLog(
        line, { type: "stock_adjustment", remarks: `Debit note ${voucher.voucherNumber} cancelled - return reversed` }, req.user._id, line.quantity, session,
      );
    }
    await voucher.deleteOne({ session });
  });

  res.json({ message: "Debit note cancelled - expense, GST, payable, and stock all reversed" });
});

module.exports = { createCreditNote, createDebitNote, cancelCreditNote, cancelDebitNote };
