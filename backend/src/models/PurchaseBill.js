const mongoose = require("mongoose");
const billItemSchema = require("./BillItem");

const purchaseBillSchema = new mongoose.Schema(
  {
    billNumber: { type: String, required: true, unique: true },
    billType: { type: String, enum: ["purchase_bill", "purchase_order"], default: "purchase_bill" },
    date: { type: Date, required: true, default: Date.now },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Ledger", required: true },
    items: [billItemSchema],
    totalAmount: { type: Number, required: true },
    paymentStatus: { type: String, enum: ["pending", "partial", "paid"], default: "pending" },
    // Separate from paymentStatus (which tracks whether the supplier has been paid) - this
    // tracks whether the bill itself is still in effect. See purchaseBillController.cancelPurchaseBill.
    status: { type: String, enum: ["confirmed", "cancelled"], default: "confirmed" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PurchaseBill", purchaseBillSchema);
