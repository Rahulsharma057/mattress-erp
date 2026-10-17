const asyncHandler = require("express-async-handler");
const BillOfMaterial = require("../models/BillOfMaterial");

const createBom = asyncHandler(async (req, res) => {
  const exists = await BillOfMaterial.findOne({ finishedItem: req.body.finishedItem });
  if (exists) {
    res.status(400);
    throw new Error("A BOM already exists for this item - update it instead of creating a new one");
  }
  const bom = await BillOfMaterial.create(req.body);
  res.status(201).json(bom);
});

const getBoms = asyncHandler(async (req, res) => {
  const boms = await BillOfMaterial.find()
    .populate("finishedItem", "name")
    .populate("components.item", "name unit");
  res.json(boms);
});

const getBomByItem = asyncHandler(async (req, res) => {
  const bom = await BillOfMaterial.findOne({ finishedItem: req.params.itemId })
    .populate("finishedItem", "name")
    .populate("components.item", "name unit stockQty");
  if (!bom) {
    res.status(404);
    throw new Error("No BOM defined for this item");
  }
  res.json(bom);
});

const updateBom = asyncHandler(async (req, res) => {
  const bom = await BillOfMaterial.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!bom) {
    res.status(404);
    throw new Error("BOM not found");
  }
  res.json(bom);
});

const deleteBom = asyncHandler(async (req, res) => {
  const bom = await BillOfMaterial.findByIdAndDelete(req.params.id);
  if (!bom) {
    res.status(404);
    throw new Error("BOM not found");
  }
  res.json({ message: "BOM deleted" });
});

module.exports = { createBom, getBoms, getBomByItem, updateBom, deleteBom };
