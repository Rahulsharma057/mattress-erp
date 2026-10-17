const asyncHandler = require("express-async-handler");
const HsnSac = require("../models/HsnSac");

const createHsn = asyncHandler(async (req, res) => {
  const hsn = await HsnSac.create(req.body); // igst auto-computed in pre-save hook
  res.status(201).json(hsn);
});

const getHsnList = asyncHandler(async (req, res) => {
  const list = await HsnSac.find();
  res.json(list);
});

const updateHsn = asyncHandler(async (req, res) => {
  const hsn = await HsnSac.findById(req.params.id);
  if (!hsn) {
    res.status(404);
    throw new Error("HSN/SAC not found");
  }
  Object.assign(hsn, req.body);
  await hsn.save(); // re-runs pre-save hook to recompute igst
  res.json(hsn);
});

const deleteHsn = asyncHandler(async (req, res) => {
  const hsn = await HsnSac.findByIdAndDelete(req.params.id);
  if (!hsn) {
    res.status(404);
    throw new Error("HSN/SAC not found");
  }
  res.json({ message: "HSN/SAC deleted" });
});

module.exports = { createHsn, getHsnList, updateHsn, deleteHsn };
