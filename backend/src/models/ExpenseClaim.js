const mongoose = require("mongoose");

const expenseClaimSchema = new mongoose.Schema(
  {
    salesman: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true, default: Date.now },
    category: { type: String, enum: ["travel", "food", "lodging", "other"], required: true },
    amount: { type: Number, required: true },
    receiptUrl: { type: String }, // Cloudinary
    remarks: { type: String },

    // Two-level approval: Admin must approve first, then Super Admin gives final approval.
    // "approved" is only reached after BOTH stages pass.
    status: {
      type: String,
      enum: ["pending", "admin_approved", "approved", "rejected"],
      default: "pending",
    },
    adminApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    adminApprovedAt: { type: Date },
    superAdminApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    superAdminApprovedAt: { type: Date },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    rejectedAt: { type: Date },
    rejectionStage: { type: String, enum: ["admin", "super_admin"] },

    // Set once fully approved and paid out via a Payment voucher (Cash/Bank credited,
    // Staff & Field Expenses debited) - see expenseClaimController.reviewExpenseClaim.
    paymentVoucher: { type: mongoose.Schema.Types.ObjectId, ref: "Voucher" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ExpenseClaim", expenseClaimSchema);
