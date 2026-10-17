const mongoose = require("mongoose");

// The full standard Tally-style parent groups a custom Account Group can nest under -
// this is what "Under Group" means on the Dealer/Ledger form: the Account Group itself
// carries this classification so every Ledger under it inherits it automatically.
const STANDARD_GROUPS = [
  "Primary", "Bank Account", "Branch / Division", "Capital Account", "Cash-in-hand",
  "Current Assets", "Current Liabilities", "Expenses (Direct)", "Expenses (Indirect)",
  "Fixed Assets", "Income (Direct)", "Income (Indirect)", "Loan & Advance",
  "Loan (Liability)", "Purchase Account", "Sales Account", "Stock-in-hand",
  "Sundry Creditors", "Sundry Debtors", "Tax - CGST", "Tax - SGST", "Tax - IGST",
];

const accountGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    // e.g. "Sundry Debtors", "Sundry Creditors", "Capital Account" etc.
    nature: {
      type: String,
      enum: ["asset", "liability", "income", "expense", "equity"],
      required: true,
    },
    // Which standard Tally-style category this group falls under (optional - defaults to
    // matching its own name when it IS one of the standard groups).
    parentGroup: { type: String, enum: STANDARD_GROUPS },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AccountGroup", accountGroupSchema);
module.exports.STANDARD_GROUPS = STANDARD_GROUPS;
