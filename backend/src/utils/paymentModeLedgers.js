// Which ledger a payment mode settles into. Shared by collectionController (salesman field
// collection approval) and voucherController (direct Receive Payment / Make Payment) so both
// paths resolve "UPI" -> "Bank Account" etc identically instead of each hard-coding its own copy.
const SETTLEMENT_LEDGER_NAME = {
  cash: "Cash Account",
  upi: "Bank Account",
  bank_transfer: "Bank Account",
  neft: "Bank Account",
  rtgs: "Bank Account",
  cheque: "Bank Account",
  other: "Bank Account",
};

const resolveSettlementLedgerName = (paymentMode) => SETTLEMENT_LEDGER_NAME[paymentMode] || "Cash Account";

module.exports = { SETTLEMENT_LEDGER_NAME, resolveSettlementLedgerName };
