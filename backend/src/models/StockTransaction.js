const mongoose = require("mongoose");

// Covers every way stock moves in this system - manual (Stock Receive, Scrap Issue/Return,
// Stock Adjustment), transactional (Sale/Purchase and their returns), and production
// (BOM-driven raw material consumption, finished-goods output from a Work Order).
const stockTransactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "receive", "scrap_issue", "scrap_return", "stock_adjustment",
        "bom_consumption", "production_output",
        "sale_out", "purchase_in", "sales_return", "purchase_return",
      ],
      required: true,
    },
    item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true },
    // Which specific size/spec moved, if this item tracks variants - see models/
    // ItemVariant.js. Optional: manual Stock Receive/Scrap/Adjustment and BOM raw-material
    // consumption aren't size-tracked, so this stays unset for those.
    variant: { type: mongoose.Schema.Types.ObjectId, ref: "ItemVariant" },
    quantity: { type: Number, required: true },
    // Only meaningful for "stock_adjustment" (a manual correction can go either way) - every
    // other type's direction is implied by its type itself.
    direction: { type: String, enum: ["increase", "decrease"] },
    referenceWorkOrder: { type: mongoose.Schema.Types.ObjectId, ref: "WorkOrder" },
    remarks: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StockTransaction", stockTransactionSchema);
