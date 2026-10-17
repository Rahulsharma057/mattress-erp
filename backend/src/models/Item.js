const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
  {
    productCode: { type: String, unique: true, sparse: true }, // auto-generated, e.g. PRD-2026-000045
    name: { type: String, required: true, trim: true }, // Product Name
    type: { type: String }, // free-text product type (distinct from category below)
    unit: { type: String, required: true }, // Auto-fetched with HSN, editable
    hsn: { type: mongoose.Schema.Types.ObjectId, ref: "HsnSac", required: true },

    fastSearch: { type: Boolean, default: false },
    decimalAllowed: { type: Boolean, default: false }, // allow fractional quantities (e.g. 1.5 unit)
    isCompanyProduct: { type: Boolean, default: true }, // self-manufactured vs third-party/traded

    // Snapshot of tax %s at time of item creation (auto-filled from HSN, kept for fast reads)
    sgst: { type: Number },
    cgst: { type: Number },
    igst: { type: Number },

    // Pricing (multiple rate levels, as used across dealer tiers)
    purchaseRate: { type: Number, default: 0 }, // P. Rate
    mrp: { type: Number, default: 0 },
    rateA: { type: Number, default: 0 }, // e.g. wholesale rate
    rateB: { type: Number, default: 0 }, // e.g. retail rate

    barcode: { type: String },
    warrantyMonths: { type: Number, default: 0 },

    // Mattress/Foam specific attributes
    category: { type: String, enum: ["mattress", "foam_sheet", "pillow", "cushion", "raw_material", "other"], default: "other" },
    size: { type: String }, // e.g. Single, Double, King, or custom LxWxH
    thickness: { type: String }, // e.g. "4 inch"
    density: { type: String }, // foam density grade

    stockQty: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 0 }, // for Low Stock Alert

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

itemSchema.pre("save", async function (next) {
  if (this.isModified("hsn") || this.isNew) {
    const HsnSac = mongoose.model("HsnSac");
    const hsn = await HsnSac.findById(this.hsn);
    if (hsn) {
      this.sgst = hsn.sgst;
      this.cgst = hsn.cgst;
      this.igst = hsn.igst;
    }
  }
  next();
});

module.exports = mongoose.model("Item", itemSchema);
