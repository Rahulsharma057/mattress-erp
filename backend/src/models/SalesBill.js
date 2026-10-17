const mongoose = require("mongoose");
const billItemSchema = require("./BillItem");

const salesBillSchema = new mongoose.Schema(
  {
    billNumber: { type: String, required: true, unique: true },
    billType: { type: String, enum: ["sales_bill", "sale_order", "cash_sale"], default: "sales_bill" },
    date: { type: Date, required: true, default: Date.now },
    party: { type: mongoose.Schema.Types.ObjectId, ref: "Ledger", required: true },
    salesman: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    items: [billItemSchema],
    totalAmount: { type: Number, required: true },
    status: { type: String, enum: ["draft", "confirmed", "modified", "cancelled"], default: "draft" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Cash sales settle immediately against Cash/Bank instead of the dealer's ledger - see
    // accountingPostings.postSalesBillAccounting. Irrelevant (undefined) for a credit sales_bill.
    paymentMode: { type: String, enum: ["cash", "bank"] },

    // Set only when this bill was confirmed despite exceeding the dealer's available credit -
    // an authorized override, not silent bypass. See salesBillController.createSalesBill.
    creditOverride: {
      overriddenBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reason: { type: String },
      overriddenAt: { type: Date },
    },

    // Frozen copy of the dealer's Bill-To details AT THE TIME this bill was created - see
    // salesBillController.createSalesBill. Exists so a later edit to the Ledger (address,
    // GSTIN, dealer code...) never silently rewrites an already-issued invoice. The Sales
    // Invoice PDF/view prefers this over the live-populated `party` field whenever it's
    // present; it's absent on bills created before this field existed, which fall back to
    // live party data exactly as before.
    billingSnapshot: {
      name: { type: String },
      dealerCode: { type: String },
      address: { type: String },
      city: { type: String },
      state: { type: String },
      pincode: { type: String },
      gstin: { type: String },
      mobile: { type: String },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SalesBill", salesBillSchema);
