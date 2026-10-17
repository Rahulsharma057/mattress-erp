// Run once after seedSuperAdmin.js: node src/seed/seedMasters.js
// Seeds common Account Groups, mattress/foam-industry HSN codes, and the internal Ledgers
// the app itself relies on by NAME to auto-post real double-entry vouchers for Sales,
// Purchase, Collection-approval and Expense-approval - so the Ledger/Item screens aren't
// empty and those flows work out of the box.
require("dotenv").config();
const connectDB = require("../config/db");
const AccountGroup = require("../models/AccountGroup");
const HsnSac = require("../models/HsnSac");
const Ledger = require("../models/Ledger");

const ACCOUNT_GROUPS = [
  { name: "Sundry Debtors", nature: "asset" }, // Dealers/parties who owe you money
  { name: "Sundry Creditors", nature: "liability" }, // Suppliers you owe money to
  { name: "Cash", nature: "asset" },
  { name: "Bank Accounts", nature: "asset" },
  { name: "Sales Account", nature: "income" },
  { name: "Purchase Account", nature: "expense" },
  { name: "Direct Expenses", nature: "expense" },
  { name: "Indirect Expenses", nature: "expense" },
  { name: "Capital Account", nature: "equity" },
  // GST payable (on sales) and GST input credit (on purchase) both live under one
  // liability group by Tally convention - the two nets against each other come return time.
  { name: "Duties & Taxes", nature: "liability" },
];

// Common HSN codes for a foam/mattress manufacturer (verify exact codes/rates with your CA
// before filing returns - these are sensible starting defaults, not tax advice).
const HSN_CODES = [
  {
    code: "9404",
    shortName: "Mattresses",
    sgst: 9,
    cgst: 9,
    type: "goods",
    unit: "PCS",
  },
  {
    code: "3921",
    shortName: "Foam Sheets (Plastic/PU)",
    sgst: 9,
    cgst: 9,
    type: "goods",
    unit: "PCS",
  },
  {
    code: "9404.90",
    shortName: "Pillows & Cushions",
    sgst: 9,
    cgst: 9,
    type: "goods",
    unit: "PCS",
  },
];

// These ledger NAMES are relied on by code - keep them in sync if you rename them, since
// each flow that posts against one looks it up by exact name (see services/
// accountingPostings.js and services/outstandingCalc.js's SETTLEMENT_LEDGER_NAME):
// - salesBillController / accountingPostings: Sales Account, Output CGST/SGST/IGST,
//   Cash Account or Bank Account (cash sales only - credit sales debit the dealer instead).
// - purchaseBillController / accountingPostings: Purchase Account, Input CGST/SGST/IGST.
// - collectionController: Cash Account / Bank Account, by the collection's payment mode.
// - expenseClaimController: Cash Account + Staff & Field Expenses.
const DEFAULT_LEDGERS = [
  { name: "Cash Account", groupName: "Cash" },
  { name: "Bank Account", groupName: "Bank Accounts" },
  { name: "Staff & Field Expenses", groupName: "Indirect Expenses" },
  { name: "Sales Account", groupName: "Sales Account" },
  { name: "Purchase Account", groupName: "Purchase Account" },
  { name: "Output CGST", groupName: "Duties & Taxes" },
  { name: "Output SGST", groupName: "Duties & Taxes" },
  { name: "Output IGST", groupName: "Duties & Taxes" },
  { name: "Input CGST", groupName: "Duties & Taxes" },
  { name: "Input SGST", groupName: "Duties & Taxes" },
  { name: "Input IGST", groupName: "Duties & Taxes" },
];

(async () => {
  await connectDB();

  for (const g of ACCOUNT_GROUPS) {
    await AccountGroup.findOneAndUpdate({ name: g.name }, g, {
      upsert: true,
      new: true,
    });
  }
  console.log(`Seeded ${ACCOUNT_GROUPS.length} account groups.`);

  for (const h of HSN_CODES) {
    const exists = await HsnSac.findOne({ code: h.code });
    if (!exists) await HsnSac.create(h); // create (not upsert) so the pre-save igst hook runs
  }
  console.log(`Seeded HSN/SAC codes (existing codes left untouched).`);

  for (const l of DEFAULT_LEDGERS) {
    const group = await AccountGroup.findOne({ name: l.groupName });
    if (!group) {
      console.warn(
        `Skipped ledger "${l.name}" - account group "${l.groupName}" not found`,
      );
      continue;
    }
    await Ledger.findOneAndUpdate(
      { name: l.name },
      { name: l.name, accountGroup: group._id, ledgerType: "unregistered" },
      { upsert: true, new: true },
    );
  }
  console.log(`Seeded ${DEFAULT_LEDGERS.length} default ledgers.`);

  process.exit(0);
})();
