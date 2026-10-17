// Regression tests for "Payment Received In" - the actual Cash/Bank ledger(s) a Sales Bill's
// payments were received into, resolved from real posted Receipt vouchers' `counterLedger`
// (see utils/paymentReceivedInfo.js and dispatchController.resolvePaymentReceivedInfo).
const test = require("node:test");
const assert = require("node:assert/strict");
const { computePaymentReceivedInfo } = require("../src/utils/paymentReceivedInfo");

const BILL_A = "aaaa00000000000000000001";
const BILL_B = "aaaa00000000000000000002";
const CASH = { _id: "cccc00000000000000000001", name: "Cash in Hand", accountGroup: { name: "Cash" } };
// A settlement ledger that has its OWN bank details saved (see models/Ledger.js) - these, not
// any Company Settings field, are the only legitimate source for bank details on an invoice.
const HDFC = {
  _id: "cccc00000000000000000002", name: "HDFC Bank - Current Account", accountGroup: { name: "Bank Accounts" },
  bankName: "HDFC Bank", bankAccountHolderName: "Sunrise Foam Industries",
  bankAccountNumber: "50100123456789", bankIfscCode: "HDFC0001234",
};
// A real-world case this fix targets: a ledger that's genuinely in the "Bank Accounts" group
// but was never actually given bank details (the Ledger Master form was left blank for it).
const BANK_NO_DETAILS = { _id: "cccc00000000000000000003", name: "Bank Account", accountGroup: { name: "Bank Accounts" } };

const receipt = (counterLedger, allocations) => ({ counterLedger, allocations });

test("Case A: one receipt into one account shows that account (with its own real bank details) and the full amount", () => {
  const vouchers = [receipt(HDFC, [{ salesBill: BILL_A, amount: 4914.1 }])];
  const result = computePaymentReceivedInfo(BILL_A, vouchers);
  assert.deepEqual(result.accounts, [{
    name: "HDFC Bank - Current Account", isBankAccount: true, bankName: "HDFC Bank", bankAccountHolderName: "Sunrise Foam Industries",
    bankAccountNumber: "50100123456789", bankIfscCode: "HDFC0001234",
  }]);
  assert.equal(result.amountPaid, 4914.1);
});

test("a Cash-group ledger with no bank fields shows by name only - no bank details expected, never a fallback from anywhere else", () => {
  const vouchers = [receipt(CASH, [{ salesBill: BILL_A, amount: 500 }])];
  const result = computePaymentReceivedInfo(BILL_A, vouchers);
  assert.deepEqual(result.accounts, [{
    name: "Cash in Hand", isBankAccount: false, bankName: undefined, bankAccountHolderName: undefined, bankAccountNumber: undefined, bankIfscCode: undefined,
  }]);
});

test("a Bank Accounts-group ledger with NO bank fields saved is still flagged as isBankAccount, so the PDF can surface the gap", () => {
  const vouchers = [receipt(BANK_NO_DETAILS, [{ salesBill: BILL_A, amount: 500 }])];
  const result = computePaymentReceivedInfo(BILL_A, vouchers);
  assert.equal(result.accounts[0].isBankAccount, true);
  assert.equal(result.accounts[0].bankName, undefined, "must never fabricate bank details that were never saved");
});

test("Case B: multiple receipts into the SAME account do not duplicate it", () => {
  const vouchers = [
    receipt(HDFC, [{ salesBill: BILL_A, amount: 2000 }]),
    receipt(HDFC, [{ salesBill: BILL_A, amount: 2914.1 }]),
  ];
  const result = computePaymentReceivedInfo(BILL_A, vouchers);
  assert.equal(result.accounts.length, 1);
  assert.equal(result.accounts[0].name, "HDFC Bank - Current Account");
  assert.equal(result.amountPaid, 4914.1);
});

test("Case C: receipts into multiple DIFFERENT accounts all show up, each once", () => {
  const vouchers = [
    receipt(CASH, [{ salesBill: BILL_A, amount: 1000 }]),
    receipt(HDFC, [{ salesBill: BILL_A, amount: 3914.1 }]),
  ];
  const result = computePaymentReceivedInfo(BILL_A, vouchers);
  assert.deepEqual(result.accounts.map((a) => a.name), ["Cash in Hand", "HDFC Bank - Current Account"]);
  assert.equal(result.amountPaid, 4914.1);
});

test("Case D: a partially paid bill shows only the accounts actually used, amount stays partial", () => {
  const vouchers = [receipt(CASH, [{ salesBill: BILL_A, amount: 2000 }])];
  const result = computePaymentReceivedInfo(BILL_A, vouchers);
  assert.deepEqual(result.accounts.map((a) => a.name), ["Cash in Hand"]);
  assert.equal(result.amountPaid, 2000, "must reflect only what was actually received, not the full bill amount");
});

test("Case E: a fully unpaid bill (no receipts at all) shows no account", () => {
  const result = computePaymentReceivedInfo(BILL_A, []);
  assert.deepEqual(result.accounts, []);
  assert.equal(result.amountPaid, 0);
});

test("Case G: a receipt with no counterLedger (historical/missing relationship) is skipped, not guessed at", () => {
  const vouchers = [receipt(null, [{ salesBill: BILL_A, amount: 500 }])];
  const result = computePaymentReceivedInfo(BILL_A, vouchers);
  assert.deepEqual(result.accounts, [], "must never fabricate an account when none is recorded");
  assert.equal(result.amountPaid, 500, "the amount is still real and counted, even though no account can be shown for it");
});

test("Case 14: a receipt allocated to a DIFFERENT bill never leaks into this bill's figures", () => {
  const vouchers = [
    receipt(HDFC, [{ salesBill: BILL_B, amount: 9999 }]), // different bill entirely
    receipt(CASH, [{ salesBill: BILL_A, amount: 500 }]),
  ];
  const result = computePaymentReceivedInfo(BILL_A, vouchers);
  assert.deepEqual(result.accounts.map((a) => a.name), ["Cash in Hand"]);
  assert.equal(result.amountPaid, 500);
});

test("a single voucher allocated across multiple bills only counts ITS allocation to the requested bill", () => {
  const vouchers = [receipt(HDFC, [{ salesBill: BILL_A, amount: 1000 }, { salesBill: BILL_B, amount: 5000 }])];
  const result = computePaymentReceivedInfo(BILL_A, vouchers);
  assert.equal(result.amountPaid, 1000, "must not count the OTHER bill's share of the same multi-bill receipt");
});

test("Case F (structural): cancelled/reversed receipts cannot appear here at all, since cancellation hard-deletes the Voucher (see voucherController.deleteVoucher) - the caller's DB query excludes them before this function ever runs", () => {
  // No fixture needed: a deleted document simply cannot be in the `vouchers` array passed in.
  // This test documents that guarantee rather than re-testing Mongoose's own delete behaviour.
  assert.equal(computePaymentReceivedInfo(BILL_A, undefined).accounts.length, 0);
});
