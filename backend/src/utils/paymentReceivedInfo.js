// Pure computation of "Payment Received In" for one Sales Bill - the ACTUAL Cash/Bank
// ledger(s) its payments were received into, resolved from real posted Receipt vouchers.
// Kept DB-free here (takes already-fetched vouchers) so it's directly unit-testable - see
// tests/paymentReceivedInfo.test.js. See dispatchController.resolvePaymentReceivedInfo for
// the Mongoose-fetching wrapper.
//
// Why `counterLedger` is the right field: a Receipt voucher's `counterLedger` is the exact
// settlement account the user picked in the "Receive Payment" dialog (see
// voucherController.receivePayment's `settlementLedger` handling) - not a guess, not the
// customer's own ledger (that's `voucher.ledger`, the party being credited).
//
// Why no "cancelled" filter is needed: cancelling/reversing a voucher hard-deletes the
// document (see voucherController.deleteVoucher - it calls `voucher.deleteOne()`, there is no
// soft-delete/status field on Voucher at all), so a cancelled receipt can never appear in the
// `vouchers` array passed in here in the first place - the caller's query already excludes it
// structurally, nothing to re-check.
const { round2 } = require("./billCalc");

// @param billId - the Sales Bill's _id (string or ObjectId)
// @param vouchers - every `voucherType: "receipt"` Voucher whose `allocations` include this
//   bill, with `counterLedger` populated: `name`, `accountGroup` (nested-populated with at
//   least `name`), and whatever of its own bank fields are genuinely saved on it -
//   bankName/bankAccountHolderName/bankAccountNumber/bankIfscCode, see models/Ledger.js.
//   MUST already be scoped to this bill by the caller's query, so a receipt allocated to a
//   different bill never reaches here.
// @returns { amountPaid, accounts } - amountPaid is the real sum actually allocated to THIS
//   bill (never another bill's share of a multi-bill receipt); accounts is the de-duplicated
//   list of distinct receiving ledgers (each { name, isBankAccount, bankName?,
//   bankAccountHolderName?, bankAccountNumber?, bankIfscCode? } - only the fields that ledger
//   actually has saved, never fabricated), in the order first encountered. `isBankAccount`
//   (true only when the ledger's own accountGroup is literally named "Bank Accounts") lets
//   the PDF distinguish "this is Cash, no bank details expected" from "this is a bank-type
//   ledger whose bank details were never filled in" - the latter is worth flagging, the
//   former is not. There is deliberately no fallback to any company-level "default bank
//   account" here - an account with no bank fields saved on its own Ledger record is shown by
//   name only (plus a note, for a bank-type account specifically).
const computePaymentReceivedInfo = (billId, vouchers) => {
  let amountPaid = 0;
  const accountsById = new Map();

  for (const v of vouchers || []) {
    const allocation = (v.allocations || []).find((a) => String(a.salesBill) === String(billId));
    if (!allocation) continue; // defensive - the caller's query should already guarantee this
    amountPaid += allocation.amount || 0;

    // Missing counterLedger (a historical voucher from before this field existed, or a
    // dangling ref) is skipped rather than guessed at - see the "Historical records or
    // missing ledger relationship" case this guards against.
    const ledger = v.counterLedger;
    const id = ledger?._id ? String(ledger._id) : ledger?.name;
    if (ledger?.name && id && !accountsById.has(id)) {
      accountsById.set(id, {
        name: ledger.name,
        isBankAccount: ledger.accountGroup?.name === "Bank Accounts",
        bankName: ledger.bankName || undefined,
        bankAccountHolderName: ledger.bankAccountHolderName || undefined,
        bankAccountNumber: ledger.bankAccountNumber || undefined,
        bankIfscCode: ledger.bankIfscCode || undefined,
      });
    }
  }

  return { amountPaid: round2(amountPaid), accounts: [...accountsById.values()] };
};

module.exports = { computePaymentReceivedInfo };
