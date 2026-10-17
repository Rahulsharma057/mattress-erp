const mongoose = require("mongoose");
const billItemSchema = require("./BillItem");

// Single polymorphic collection for Receipt, Payment, Credit Note, Debit Note, Contra, Journal.
// Keeping one collection (rather than 6) keeps ledger balance calculation and reporting simple.
const voucherSchema = new mongoose.Schema(
  {
    voucherType: {
      type: String,
      enum: ["receipt", "payment", "credit_note", "debit_note", "contra", "journal"],
      required: true,
    },
    voucherNumber: { type: String, required: true, unique: true },
    date: { type: Date, required: true, default: Date.now },

    // Simple double-entry-lite: one primary ledger + amount + dr/cr, plus optional narration lines
    ledger: { type: mongoose.Schema.Types.ObjectId, ref: "Ledger", required: true },
    amount: { type: Number, required: true },
    drCr: { type: String, enum: ["debit", "credit"], required: true },

    // For Contra/Journal you may need a second ledger leg
    counterLedger: { type: mongoose.Schema.Types.ObjectId, ref: "Ledger" },

    narration: { type: String },
    referenceBill: { type: mongoose.Schema.Types.ObjectId, refPath: "referenceModel" },
    referenceModel: { type: String, enum: ["SalesBill", "PurchaseBill"] },

    // Optional invoice-level settlement, for a Receipt (against Sales Bills) or a Payment
    // (against Purchase Bills). This is the single source of truth for "how much of THIS
    // bill has been settled" - see services/outstandingCalc, which reads allocations off
    // Vouchers rather than any other document, so there is exactly one place that answers
    // that question. An empty/absent array means the whole amount is on-account/advance.
    allocations: [
      {
        salesBill: { type: mongoose.Schema.Types.ObjectId, ref: "SalesBill" },
        purchaseBill: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseBill" },
        amount: { type: Number },
        _id: false,
      },
    ],

    paymentMode: {
      type: String,
      enum: ["cash", "upi", "bank_transfer", "neft", "rtgs", "cheque", "other"],
    },
    referenceNumber: { type: String }, // cheque no / UTR / transaction ref

    // How this voucher came to exist - "manual" means a user typed it directly into the
    // Vouchers screen (Accounts page); everything else was posted automatically by some
    // other action, named here so the Vouchers list can show exactly where each one came
    // from instead of leaving "was this automatic or did someone create this?" unanswered.
    source: {
      type: String,
      enum: [
        "manual", // entered directly on the Vouchers screen
        "collection_approval", // salesman field collection, approved by Accountant/Admin
        "expense_approval", // salesman expense claim, Super Admin final approval
        "direct_receipt", // "Receive Payment" button on a Sales Bill
        "direct_payment", // "Make Payment" button on a Purchase Bill
        "credit_note", // customer return
        "debit_note", // supplier return
      ],
      default: "manual",
    },

    // Only set for credit_note/debit_note - the exact line items (qty/rate/tax) that were
    // returned. Needed so a later cancellation can reverse the EXACT same stock movement and
    // Sales/Purchase Account + GST split that was originally posted (see
    // creditDebitNoteController.cancelCreditNote/cancelDebitNote) - without this, cancelling
    // a note could only ever reverse the party-ledger leg, never the linked revenue/GST/stock.
    items: [billItemSchema],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Voucher", voucherSchema);
