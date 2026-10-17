// Real double-entry postings for Sales/Purchase bills - the single place that knows how a
// bill turns into ledger movements, so Sales, Purchase, and their cancellation/reversal all
// use the exact same Dr/Cr logic instead of each controller inventing its own partial version.
//
// Previously a Sales Bill only ever did `applyLedgerDelta(party, totalAmount, "debit")` - the
// dealer's balance went up, but nothing was ever credited anywhere (no Sales Account, no GST
// output ledgers), so the books never actually balanced beyond the one party ledger. This
// makes it real double-entry:
//   Credit sale:  Dr Customer                       = totalAmount
//                    Cr Sales Account                = taxable base
//                    Cr Output CGST/SGST/IGST        = tax heads
//   Cash sale:    Dr Cash/Bank (by paymentMode)      = totalAmount
//                    Cr Sales Account / Output taxes  (same as above)
//   Purchase:     Dr Purchase Account                = taxable base
//                 Dr Input CGST/SGST/IGST            = tax heads
//                    Cr Supplier                     = totalAmount
const Ledger = require("../models/Ledger");
const { applyLedgerDelta } = require("../controllers/voucherController");
const { round2 } = require("../utils/billCalc");

const LEDGER_NAMES = {
  cash: "Cash Account",
  bank: "Bank Account",
  sales: "Sales Account",
  purchase: "Purchase Account",
  outputCgst: "Output CGST",
  outputSgst: "Output SGST",
  outputIgst: "Output IGST",
  inputCgst: "Input CGST",
  inputSgst: "Input SGST",
  inputIgst: "Input IGST",
};

const findLedgerOrThrow = async (name, session) => {
  const ledger = await Ledger.findOne({ name }).session(session);
  if (!ledger) {
    const err = new Error(`Cannot post: accounting ledger "${name}" is not set up. Run the masters seed, or create it under Ledger master, first.`);
    err.statusCode = 500;
    throw err;
  }
  return ledger;
};

// Splits a bill's line items into taxable base vs each tax head. Shared by posting AND
// cancellation, so a reversal always undoes exactly the numbers that were originally posted.
//
// CRITICAL: `base` is DERIVED as `totalAmount - cgst - sgst - igst`, not summed and rounded
// independently. totalAmount is what gets posted as the single Dr (or Cr) leg of the entry
// (see callers below) - if base/cgst/sgst/igst were each rounded from their own raw sums,
// their total could differ from totalAmount by a few paise/rupees after rounding, which
// would post a voucher where Dr != Cr. Deriving base this way makes
// `totalAmount === base + cgst + sgst + igst` true by construction, always, not approximately.
const splitTaxes = (items, totalAmount) => {
  let cgst = 0, sgst = 0, igst = 0;
  for (const line of items) {
    const lineBase = line.quantity * line.rate;
    cgst += (lineBase * (line.cgst || 0)) / 100;
    sgst += (lineBase * (line.sgst || 0)) / 100;
    igst += (lineBase * (line.igst || 0)) / 100;
  }
  cgst = round2(cgst);
  sgst = round2(sgst);
  igst = round2(igst);
  const base = round2(totalAmount - cgst - sgst - igst);
  return { base, cgst, sgst, igst };
};

// @param opts.reverse - true to post the exact opposite (used when cancelling a bill)
// @param opts.session - pass to make every write here part of an in-progress Mongo
//   transaction (see utils/withTransaction) - omit for a plain non-transactional write.
const postSalesBillAccounting = async ({ partyId, items, totalAmount, isCashSale, paymentMode }, { reverse = false, session } = {}) => {
  const { base, cgst, sgst, igst } = splitTaxes(items, totalAmount);
  const flip = (drCr) => (reverse ? (drCr === "debit" ? "credit" : "debit") : drCr);

  const debitLedgerId = isCashSale
    ? (await findLedgerOrThrow(LEDGER_NAMES[paymentMode === "bank" ? "bank" : "cash"], session))._id
    : partyId;
  await applyLedgerDelta(debitLedgerId, totalAmount, flip("debit"), session);

  await applyLedgerDelta((await findLedgerOrThrow(LEDGER_NAMES.sales, session))._id, base, flip("credit"), session);
  if (cgst > 0) await applyLedgerDelta((await findLedgerOrThrow(LEDGER_NAMES.outputCgst, session))._id, cgst, flip("credit"), session);
  if (sgst > 0) await applyLedgerDelta((await findLedgerOrThrow(LEDGER_NAMES.outputSgst, session))._id, sgst, flip("credit"), session);
  if (igst > 0) await applyLedgerDelta((await findLedgerOrThrow(LEDGER_NAMES.outputIgst, session))._id, igst, flip("credit"), session);
};

const postPurchaseBillAccounting = async ({ partyId, items, totalAmount }, { reverse = false, session } = {}) => {
  const { base, cgst, sgst, igst } = splitTaxes(items, totalAmount);
  const flip = (drCr) => (reverse ? (drCr === "debit" ? "credit" : "debit") : drCr);

  await applyLedgerDelta((await findLedgerOrThrow(LEDGER_NAMES.purchase, session))._id, base, flip("debit"), session);
  if (cgst > 0) await applyLedgerDelta((await findLedgerOrThrow(LEDGER_NAMES.inputCgst, session))._id, cgst, flip("debit"), session);
  if (sgst > 0) await applyLedgerDelta((await findLedgerOrThrow(LEDGER_NAMES.inputSgst, session))._id, sgst, flip("debit"), session);
  if (igst > 0) await applyLedgerDelta((await findLedgerOrThrow(LEDGER_NAMES.inputIgst, session))._id, igst, flip("debit"), session);

  await applyLedgerDelta(partyId, totalAmount, flip("credit"), session);
};

module.exports = { splitTaxes, postSalesBillAccounting, postPurchaseBillAccounting };
