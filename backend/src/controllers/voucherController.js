const asyncHandler = require("express-async-handler");
const Voucher = require("../models/Voucher");
const Ledger = require("../models/Ledger");
const generateBillNumber = require("../utils/generateBillNumber");
const withTransaction = require("../utils/withTransaction");
const { resolveSettlementLedgerName } = require("../utils/paymentModeLedgers");
const { generateVoucherReceiptPDF } = require("../services/pdfGenerator");
const {
  validateAllocations, clipAllocationsToCurrentOutstanding,
  validatePurchaseAllocations, clipPurchaseAllocationsToCurrentOutstanding,
} = require("../services/outstandingCalc");

// Applies a signed balance change to a ledger. debit => balance increases, credit => decreases.
// (Simple running-balance model matching the drCr field on the Voucher schema.)
// Pass `session` to make this write part of an in-progress Mongo transaction - see utils/withTransaction.
const applyLedgerDelta = async (ledgerId, amount, drCr, session) => {
  const delta = drCr === "debit" ? amount : -amount;
  await Ledger.findByIdAndUpdate(ledgerId, { $inc: { currentBalance: delta } }, { session });
};

const VOUCHER_PREFIX = {
  receipt: "RCP", payment: "PAY", credit_note: "CN", debit_note: "DN", contra: "CTR", journal: "JRN",
};

// @desc Create a voucher (Receipt/Payment/Credit Note/Debit Note/Contra/Journal). Every
//       voucher is a real two-sided entry - `ledger` (Dr/Cr per `drCr`) and `counterLedger`
//       (the opposite side) are both required (see createVoucherValidator), so a manual
//       Receipt/Payment can never post as a "direct"/single-sided balance bump on just one
//       account the way it used to (e.g. crediting a customer with nothing ever debited to
//       Cash/Bank in return).
const createVoucher = asyncHandler(async (req, res) => {
  const { voucherType, ledger, amount, drCr, counterLedger, narration, date, referenceBill, referenceModel } = req.body;

  if (!VOUCHER_PREFIX[voucherType]) {
    res.status(400);
    throw new Error("Invalid voucher type");
  }

  const voucherNumber = await generateBillNumber(Voucher, VOUCHER_PREFIX[voucherType], "voucherNumber");
  const oppositeDrCr = drCr === "debit" ? "credit" : "debit";

  const voucher = await withTransaction(async (session) => {
    const [created] = await Voucher.create([{
      voucherType, voucherNumber, date, ledger, amount, drCr, counterLedger,
      narration, referenceBill, referenceModel, source: "manual", createdBy: req.user._id,
    }], { session });

    await applyLedgerDelta(ledger, amount, drCr, session);
    await applyLedgerDelta(counterLedger, amount, oppositeDrCr, session);

    return created;
  });

  res.status(201).json(voucher);
});

// @desc Directly record a Receipt against a dealer - for an accountant/admin/super_admin
//       entering money received without going through the salesman Visit/Collection
//       pending-approval flow (that flow is for a SALESMAN's own claim; this one is already
//       initiated by an accounts user, so it posts immediately, exactly like an approved
//       collection does). This is what powers the "Receive Payment" action on a Sales Bill.
// @route POST /api/accounts/receive-payment
// @body { party, amount, paymentMode, referenceNumber?, allocations?: [{salesBill, amount}], narration?, settlementLedger? }
const receivePayment = asyncHandler(async (req, res) => {
  const { party, amount, paymentMode, referenceNumber, allocations, narration, settlementLedger } = req.body;

  try {
    await validateAllocations(party, amount, allocations);
  } catch (err) {
    res.status(400);
    throw err;
  }
  const clippedAllocations = await clipAllocationsToCurrentOutstanding(party, allocations || []);

  // `settlementLedger` lets the user pick WHICH of our own Cash/Bank ledgers this actually
  // landed in - a business with more than one bank account needs that choice; without it,
  // every bank-ish payment mode silently falls back to a single hard-coded "Bank Account"
  // ledger (resolveSettlementLedgerName), which is correct ONLY while there is exactly one.
  const settlementLedgerDoc = settlementLedger
    ? await Ledger.findById(settlementLedger)
    : await Ledger.findOne({ name: resolveSettlementLedgerName(paymentMode) });
  if (!settlementLedgerDoc) {
    res.status(settlementLedger ? 400 : 500);
    throw new Error(settlementLedger
      ? "Selected settlement account was not found"
      : `Cannot post: settlement ledger "${resolveSettlementLedgerName(paymentMode)}" is not set up. Run the masters seed, or create it under Ledger master, first.`);
  }

  const voucher = await withTransaction(async (session) => {
    const voucherNumber = await generateBillNumber(Voucher, "RCP", "voucherNumber");
    const [created] = await Voucher.create([{
      voucherType: "receipt", voucherNumber, date: new Date(),
      ledger: party, amount, drCr: "credit", counterLedger: settlementLedgerDoc._id,
      narration: narration || "Payment received", paymentMode, referenceNumber,
      allocations: clippedAllocations, source: "direct_receipt", createdBy: req.user._id,
    }], { session });
    await applyLedgerDelta(party, amount, "credit", session);
    await applyLedgerDelta(settlementLedgerDoc._id, amount, "debit", session);
    return created;
  });

  res.status(201).json(voucher);
});

// @desc Mirror of receivePayment for the payable side - "Make Payment" on a Purchase Bill.
// @route POST /api/accounts/make-payment
// @body { supplier, amount, paymentMode, referenceNumber?, allocations?: [{purchaseBill, amount}], narration?, settlementLedger? }
const makePayment = asyncHandler(async (req, res) => {
  const { supplier, amount, paymentMode, referenceNumber, allocations, narration, settlementLedger } = req.body;

  try {
    await validatePurchaseAllocations(supplier, amount, allocations);
  } catch (err) {
    res.status(400);
    throw err;
  }
  const clippedAllocations = await clipPurchaseAllocationsToCurrentOutstanding(supplier, allocations || []);

  // See the matching comment in receivePayment above - `settlementLedger` lets the user pick
  // WHICH of our own Cash/Bank ledgers this is actually paid from, instead of always the one
  // hard-coded ledger a bare payment mode resolves to.
  const settlementLedgerDoc = settlementLedger
    ? await Ledger.findById(settlementLedger)
    : await Ledger.findOne({ name: resolveSettlementLedgerName(paymentMode) });
  if (!settlementLedgerDoc) {
    res.status(settlementLedger ? 400 : 500);
    throw new Error(settlementLedger
      ? "Selected settlement account was not found"
      : `Cannot post: settlement ledger "${resolveSettlementLedgerName(paymentMode)}" is not set up. Run the masters seed, or create it under Ledger master, first.`);
  }

  const voucher = await withTransaction(async (session) => {
    const voucherNumber = await generateBillNumber(Voucher, "PAY", "voucherNumber");
    const [created] = await Voucher.create([{
      voucherType: "payment", voucherNumber, date: new Date(),
      ledger: supplier, amount, drCr: "debit", counterLedger: settlementLedgerDoc._id,
      narration: narration || "Payment made", paymentMode, referenceNumber,
      allocations: clippedAllocations, source: "direct_payment", createdBy: req.user._id,
    }], { session });
    await applyLedgerDelta(supplier, amount, "debit", session);
    await applyLedgerDelta(settlementLedgerDoc._id, amount, "credit", session);
    return created;
  });

  res.status(201).json(voucher);
});

const getVouchers = asyncHandler(async (req, res) => {
  const filter = {};
  // A ledger can be the primary `ledger` OR the `counterLedger` on a voucher (e.g. Cash is
  // the counterLedger on a Payment voucher whose primary ledger is the supplier) - match
  // either side, the same way getLedgerTransactions/getLedgerStatement already do.
  if (req.query.ledger) filter.$or = [{ ledger: req.query.ledger }, { counterLedger: req.query.ledger }];
  if (req.query.voucherType) filter.voucherType = req.query.voucherType;
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) filter.date.$lte = new Date(req.query.to);
  }

  const vouchers = await Voucher.find(filter)
    .populate("ledger", "name")
    .populate("counterLedger", "name")
    .sort({ date: -1 });
  res.json(vouchers);
});

// @desc Delete a voucher - reverses its effect on the ledger balance(s)
const deleteVoucher = asyncHandler(async (req, res) => {
  const voucher = await Voucher.findById(req.params.id);
  if (!voucher) {
    res.status(404);
    throw new Error("Voucher not found");
  }

  // A Credit/Debit Note posts extra legs (Sales/Purchase Account, GST, stock) that never go
  // through `ledger`/`counterLedger` - this generic delete only knows about those two fields,
  // so it would reverse the party ledger and silently leave revenue, GST, and stock wrong.
  // Those types have their own dedicated cancel endpoint that reverses everything correctly.
  if (voucher.voucherType === "credit_note" || voucher.voucherType === "debit_note") {
    res.status(400);
    throw new Error(`Use DELETE /api/accounts/${voucher.voucherType === "credit_note" ? "credit-notes" : "debit-notes"}/${voucher._id} to cancel a ${voucher.voucherType.replace("_", " ")} - it also reverses the linked revenue/GST and stock movement, which this endpoint cannot do.`);
  }

  await withTransaction(async (session) => {
    // Reverse the original entries
    const reverseDrCr = voucher.drCr === "debit" ? "credit" : "debit";
    await applyLedgerDelta(voucher.ledger, voucher.amount, reverseDrCr, session);
    if (voucher.counterLedger) {
      await applyLedgerDelta(voucher.counterLedger, voucher.amount, voucher.drCr, session);
    }
    await voucher.deleteOne({ session });
  });

  res.json({ message: "Voucher deleted and ledger balance reversed" });
});

// @desc Printable/downloadable PDF for a posted Receipt or Payment voucher - generated on
//       demand straight from the already-posted Voucher and streamed back, never uploaded or
//       cached anywhere and never written back to the database, so opening/printing/
//       downloading this can never create a new voucher or ledger entry.
// @route GET /api/accounts/:id/receipt
const getVoucherReceipt = asyncHandler(async (req, res) => {
  const voucher = await Voucher.findById(req.params.id)
    .populate("ledger", "name")
    .populate("counterLedger", "name")
    .populate("allocations.salesBill", "billNumber")
    .populate("allocations.purchaseBill", "billNumber");
  if (!voucher) {
    res.status(404);
    throw new Error("Voucher not found");
  }
  if (voucher.voucherType !== "receipt" && voucher.voucherType !== "payment") {
    res.status(400);
    throw new Error("A printable receipt is only available for Receipt and Payment vouchers");
  }

  // `ledger` is always the party (dealer/supplier) side, `counterLedger` the Cash/Bank side -
  // see createVoucher/receivePayment/makePayment, which always post it that way.
  const partyName = voucher.ledger?.name || "-";
  const settlementName = voucher.counterLedger?.name || "-";
  const invoiceRefs = (voucher.allocations || [])
    .map((a) => a.salesBill?.billNumber || a.purchaseBill?.billNumber)
    .filter(Boolean);

  const pdfBuffer = await generateVoucherReceiptPDF(voucher, { partyName, settlementName, invoiceRefs });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${voucher.voucherNumber}.pdf"`);
  res.send(pdfBuffer);
});

// @desc Ledger statement: running balance list of all vouchers for one ledger (for Reports/UI)
const getLedgerStatement = asyncHandler(async (req, res) => {
  const { ledgerId } = req.params;
  const ledger = await Ledger.findById(ledgerId);
  if (!ledger) {
    res.status(404);
    throw new Error("Ledger not found");
  }

  const vouchers = await Voucher.find({ $or: [{ ledger: ledgerId }, { counterLedger: ledgerId }] }).sort({ date: 1 });

  let running = ledger.openingBalance || 0;
  const statement = vouchers.map((v) => {
    const isPrimary = String(v.ledger) === String(ledgerId);
    const effectiveDrCr = isPrimary ? v.drCr : (v.drCr === "debit" ? "credit" : "debit");
    running += effectiveDrCr === "debit" ? v.amount : -v.amount;
    return {
      date: v.date, voucherNumber: v.voucherNumber, voucherType: v.voucherType,
      narration: v.narration, drCr: effectiveDrCr, amount: v.amount, runningBalance: running,
    };
  });

  res.json({ ledger: { name: ledger.name, openingBalance: ledger.openingBalance, currentBalance: ledger.currentBalance }, statement });
});

module.exports = { createVoucher, receivePayment, makePayment, getVouchers, deleteVoucher, getLedgerStatement, getVoucherReceipt, applyLedgerDelta };
