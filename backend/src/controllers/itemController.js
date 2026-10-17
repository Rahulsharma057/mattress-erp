const asyncHandler = require("express-async-handler");
const Item = require("../models/Item");
const ItemVariant = require("../models/ItemVariant");
const StockTransaction = require("../models/StockTransaction");
const generateBillNumber = require("../utils/generateBillNumber");
const paginate = require("../utils/paginate");

// Stock-movement types that bring stock IN vs take it OUT - used below to total up each
// variant's lifetime received/issued, same classification applyVariantStockDelta's callers
// already use for the sign of their own $inc.
const RECEIVED_TYPES = ["receive", "scrap_return", "purchase_in", "sales_return", "production_output"];
const ISSUED_TYPES = ["scrap_issue", "sale_out", "purchase_return", "bom_consumption"];

const createItem = asyncHandler(async (req, res) => {
  const productCode = req.body.productCode || await generateBillNumber(Item, "PRD", "productCode", 6);
  const item = await Item.create({ ...req.body, productCode }); // tax %s auto-filled from HSN in pre-save hook
  res.status(201).json(item);
});

// @desc List items. Every dropdown/picker across the app (Sales, Purchase, Stock, Production,
//       Accounts, Salesman...) calls this with no `page` - it keeps getting the old plain-
//       array shape, capped at a sane limit, so none of those call sites had to change.
//       The Item Master screen passes `page`/`limit`/`search` explicitly and gets back a real
//       paginated, server-searched page instead - search is never done by downloading
//       everything and filtering in the browser.
// @route GET /api/masters/items?search=&category=&lowStock=&page=&limit=
const getItems = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.lowStock === "true") {
    filter.$expr = { $lte: ["$stockQty", "$reorderLevel"] };
  }
  if (req.query.search) {
    const safe = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // escape regex metachars
    const re = new RegExp(safe, "i");
    filter.$or = [{ name: re }, { productCode: re }, { barcode: re }];
  }

  const query = Item.find(filter).populate("hsn", "code shortName sgst cgst igst").sort({ name: 1 });

  if (!req.query.page) {
    const items = await query.limit(500);
    return res.json(items);
  }

  const { data, pagination } = await paginate(query, req.query);
  res.json({ items: data, pagination });
});

const updateItem = asyncHandler(async (req, res) => {
  const item = await Item.findById(req.params.id);
  if (!item) {
    res.status(404);
    throw new Error("Item not found");
  }
  Object.assign(item, req.body);
  await item.save();
  res.json(item);
});

const deleteItem = asyncHandler(async (req, res) => {
  const item = await Item.findByIdAndDelete(req.params.id);
  if (!item) {
    res.status(404);
    throw new Error("Item not found");
  }
  res.json({ message: "Item deleted" });
});

// @desc Size/specification-wise stock for one Item - every ItemVariant it has, each with its
//       own lifetime Received/Issued (from StockTransaction) and current Available quantity.
//       Powers the Item Master "View" stock dialog AND the Sales/Purchase specification
//       dropdowns - the same list, one source of truth (see models/ItemVariant.js).
// @route GET /api/masters/items/:id/variants
const getItemVariants = asyncHandler(async (req, res) => {
  const variants = await ItemVariant.find({ item: req.params.id }).sort({ isUnspecified: 1, sizeLabel: 1 });

  const totals = await StockTransaction.aggregate([
    { $match: { variant: { $in: variants.map((v) => v._id) } } },
    { $group: { _id: { variant: "$variant", type: "$type" }, total: { $sum: "$quantity" } } },
  ]);
  const byVariant = {};
  for (const row of totals) {
    const key = String(row._id.variant);
    if (!byVariant[key]) byVariant[key] = { received: 0, issued: 0 };
    if (RECEIVED_TYPES.includes(row._id.type)) byVariant[key].received += row.total;
    else if (ISSUED_TYPES.includes(row._id.type)) byVariant[key].issued += row.total;
  }

  res.json(variants.map((v) => ({
    _id: v._id,
    length: v.length, width: v.width, thickness: v.thickness, density: v.density, unit: v.unit,
    sizeLabel: v.sizeLabel, isUnspecified: v.isUnspecified,
    availableQty: v.stockQty,
    totalReceived: byVariant[String(v._id)]?.received || 0,
    totalIssued: byVariant[String(v._id)]?.issued || 0,
  })));
});

module.exports = { createItem, getItems, updateItem, deleteItem, getItemVariants };
