const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  { name: String, url: String, uploadedAt: { type: Date, default: Date.now } },
  { _id: false }
);

const ledgerSchema = new mongoose.Schema(
  {
    // ----- Basic Details -----
    dealerCode: { type: String, unique: true, sparse: true }, // auto-generated, e.g. DLR-2026-000125
    name: { type: String, required: true, trim: true }, // Dealer / Supplier / Party Name
    // "individual" is a standalone personal/self account (e.g. an employee advance, a petty-
    // cash custodian, a one-off personal loan ledger) - a real money-in/money-out account
    // like any other, but never a Dealer/Supplier: it never appears in Sales/Purchase party
    // pickers (see utils/partyLedgerFilter) and carries none of the dealer-only fields
    // (credit limit, salesman assignment, dispatch address) as REQUIRED.
    entityType: { type: String, enum: ["dealer", "supplier", "individual"], default: "dealer" },
    dealerType: { type: String, enum: ["wholesale", "retail"] },
    gstin: { type: String },
    panNumber: { type: String },
    mobile: { type: String },
    email: { type: String },
    website: { type: String },
    isActive: { type: Boolean, default: true }, // Status: Active/Inactive

    accountGroup: { type: mongoose.Schema.Types.ObjectId, ref: "AccountGroup", required: true },
    salesman: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // CURRENT assigned salesman

    // Full history of every salesman this dealer has ever been assigned to, and when. The
    // current entry (assignedTo: null) always matches `salesman` above - see
    // ledgerController's createLedger/updateLedger, which are the only places this changes.
    // Past sales/visits/collections keep whichever salesman was assigned AT THE TIME (they
    // store their own salesman reference directly) - this history is for Dealer 360 display,
    // it never rewrites historical transactions.
    salesmanHistory: [
      {
        salesman: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        assignedFrom: { type: Date, default: Date.now },
        assignedTo: { type: Date, default: null },
        _id: false,
      },
    ],

    // ----- Address Details -----
    address: { type: String }, // Billing Address
    shippingAddress: { type: String },
    destination: { type: String }, // legacy alias for city, kept for backward compatibility
    city: { type: String },
    pincode: { type: String },
    state: { type: String },
    country: { type: String, default: "India" },

    // ----- Business Details -----
    contactPerson: { type: String },
    designation: { type: String },
    landlineNumber: { type: String },
    paymentTermsDays: { type: Number },
    creditLimit: { type: Number },

    // ----- Bank Details ----- (the dealer/supplier's OWN bank account - a reference for
    // NEFT/RTGS, not where OUR money settles; that's the separate Cash/Bank Account ledger
    // chosen per voucher - see services/accountingPostings). Lets anyone looking at this
    // dealer/supplier see which account money should go to, or came from, without having to
    // ask every time a payment is made.
    bankAccountHolderName: { type: String },
    bankAccountNumber: { type: String },
    bankIfscCode: { type: String, uppercase: true, trim: true },
    bankName: { type: String },

    // ----- Tax & Other Details -----
    ledgerType: { type: String, enum: ["registered", "unregistered"], default: "unregistered" }, // GST Treatment
    gstState: { type: String },
    placeOfSupply: { type: String },
    tcsApplicable: { type: Boolean, default: false },
    tdsApplicable: { type: Boolean, default: false },
    ewayBillApplicable: { type: Boolean, default: false },

    // ----- Additional Information -----
    businessNature: { type: String },
    remarks: { type: String },
    documents: [documentSchema],

    ledgerDate: { type: Date, default: Date.now },

    // Running balance is computed from Vouchers/Bills, but a cached snapshot helps fast dashboards
    openingBalance: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Ledger", ledgerSchema);
