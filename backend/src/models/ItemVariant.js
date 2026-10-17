const mongoose = require("mongoose");

// A specific manufacturing specification of a general Item - e.g. "Foam Mattress" (the Item)
// at "72x36, 4in thick, density 32" (one ItemVariant) vs "78x36, 5in thick, density 40"
// (another ItemVariant of the SAME Item). Stock is tracked PER VARIANT, never merged just
// because the general Item name matches - see services/itemVariants.applyVariantStockDelta.
const itemVariantSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true },
    length: { type: Number },
    width: { type: Number },
    thickness: { type: Number },
    density: { type: Number },
    unit: { type: String, default: "inch" }, // dimension unit (length/width/thickness) - independent of the Item's own stock-counting unit
    // Auto-built display string (e.g. "72x36 inch · 4 inch thick · D32") so every screen that
    // lists variants shows the same label without re-deriving it - see buildSizeLabel.
    sizeLabel: { type: String, required: true },
    // True only for the one "specification not known yet" bucket a purchase can land stock in
    // when the size wasn't identified at receiving time (see services/itemVariants) - kept
    // separate from every real, identified variant so it's never sellable as a known size.
    isUnspecified: { type: Boolean, default: false },
    stockQty: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Enforces "one variant per exact specification per item" - calling getOrCreateVariant twice
// with the same {item, length, width, thickness, density} always resolves to the same
// document (including the all-null "unspecified" combination, which collapses to a single
// row per item by the same uniqueness rule).
itemVariantSchema.index({ item: 1, length: 1, width: 1, thickness: 1, density: 1 }, { unique: true });

module.exports = mongoose.model("ItemVariant", itemVariantSchema);
