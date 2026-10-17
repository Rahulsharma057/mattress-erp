const mongoose = require("mongoose");

// A salesman's field collection is NOT money received yet - it is a claim that needs
// Accountant/Admin/Super Admin approval before it becomes a real Receipt voucher against
// the dealer's ledger. This is what separates "salesman said they collected X" from
// "accounts confirmed X actually came in" (see collectionController.reviewCollection).
const collectionSchema = new mongoose.Schema(
  {
    visit: { type: mongoose.Schema.Types.ObjectId, ref: "Visit" }, // the field visit this was logged against, if any
    party: { type: mongoose.Schema.Types.ObjectId, ref: "Ledger", required: true },
    salesman: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, default: Date.now },
    amount: { type: Number, required: true, min: 0.01 },
    paymentMode: {
      type: String,
      enum: ["cash", "upi", "bank_transfer", "neft", "rtgs", "cheque", "other"],
      default: "cash",
    },
    referenceNumber: { type: String }, // cheque no / UTR / transaction ref
    remarks: { type: String },
    proofUrl: { type: String }, // Cloudinary upload of payment proof, if attached

    // Optional per-invoice allocation. If empty, the full amount is an unallocated/advance
    // collection against the party. Sum of allocations must never exceed `amount`.
    allocations: [
      {
        salesBill: { type: mongoose.Schema.Types.ObjectId, ref: "SalesBill" },
        amount: { type: Number },
        _id: false,
      },
    ],

    status: {
      type: String,
      enum: ["pending_approval", "approved", "rejected"],
      default: "pending_approval",
    },

    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    rejectedAt: { type: Date },
    rejectionReason: { type: String },

    // Set exactly once, when approved - guards against a double-approve creating two
    // Receipt vouchers for the same collection (see collectionController.reviewCollection).
    voucherId: { type: mongoose.Schema.Types.ObjectId, ref: "Voucher" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Collection", collectionSchema);
