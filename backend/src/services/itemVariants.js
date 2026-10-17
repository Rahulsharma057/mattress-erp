// Shared specification/variant logic for Work Orders, Purchase, and Sales - see
// models/ItemVariant.js. Item -> Variant -> Work Order/Purchase/Sales -> Stock Movements,
// all using the same source of truth instead of each module inventing its own size handling.
const ItemVariant = require("../models/ItemVariant");
const Item = require("../models/Item");

const toNumberOrNull = (v) => (v === undefined || v === null || v === "" ? null : Number(v));

const buildSizeLabel = ({ length, width, thickness, density, unit }) => {
  const u = unit || "inch";
  const parts = [];
  if (length && width) parts.push(`${length}x${width} ${u}`);
  else if (length) parts.push(`${length} ${u} (L)`);
  else if (width) parts.push(`${width} ${u} (W)`);
  if (thickness) parts.push(`${thickness} ${u} thick`);
  if (density) parts.push(`D${density}`);
  return parts.length > 0 ? parts.join(" · ") : "Unspecified";
};

// Finds the exact-matching variant for a specification, or creates it - idempotent, so
// repeated purchases/work-orders of the same spec accumulate stock on one row instead of
// fragmenting into duplicates. Only Work Order and Purchase call this; Sales only ever
// SELECTS an already-existing variant (see salesBillController) - it never invents one.
const getOrCreateVariant = async ({ item, length, width, thickness, density, unit }, session) => {
  const spec = {
    length: toNumberOrNull(length), width: toNumberOrNull(width),
    thickness: toNumberOrNull(thickness), density: toNumberOrNull(density),
  };
  const isUnspecified = !spec.length && !spec.width && !spec.thickness && !spec.density;

  let variant = await ItemVariant.findOne({ item, ...spec }).session(session || null);
  if (!variant) {
    [variant] = await ItemVariant.create([{
      item, ...spec, unit: unit || "inch", isUnspecified,
      sizeLabel: buildSizeLabel({ ...spec, unit }),
    }], { session });
  }
  return variant;
};

// Applies a stock delta to a variant AND mirrors it onto the parent Item's own stockQty,
// which stays the rollup total across all of that item's variants - every existing consumer
// (Low Stock Report, Dashboard, item-level overselling checks) reads Item.stockQty directly
// and must keep working unchanged without knowing variants exist at all.
const applyVariantStockDelta = async (variantId, itemId, delta, session) => {
  if (!variantId) {
    // No variant on this line (legacy data from before variants existed) - fall back to the
    // item-level update only, exactly like the old applyStockDelta did.
    await Item.findByIdAndUpdate(itemId, { $inc: { stockQty: delta } }, { session });
    return;
  }
  await ItemVariant.findByIdAndUpdate(variantId, { $inc: { stockQty: delta } }, { session });
  await Item.findByIdAndUpdate(itemId, { $inc: { stockQty: delta } }, { session });
};

module.exports = { getOrCreateVariant, applyVariantStockDelta, buildSizeLabel };
