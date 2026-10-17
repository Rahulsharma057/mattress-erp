const asyncHandler = require("express-async-handler");
const AccountGroup = require("../models/AccountGroup");

const createAccountGroup = asyncHandler(async (req, res) => {
  const group = await AccountGroup.create(req.body);
  res.status(201).json(group);
});

const getAccountGroups = asyncHandler(async (req, res) => {
  const groups = await AccountGroup.find();
  res.json(groups);
});

const updateAccountGroup = asyncHandler(async (req, res) => {
  const group = await AccountGroup.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!group) {
    res.status(404);
    throw new Error("Account group not found");
  }
  res.json(group);
});

const deleteAccountGroup = asyncHandler(async (req, res) => {
  const group = await AccountGroup.findByIdAndDelete(req.params.id);
  if (!group) {
    res.status(404);
    throw new Error("Account group not found");
  }
  res.json({ message: "Account group deleted" });
});

module.exports = { createAccountGroup, getAccountGroups, updateAccountGroup, deleteAccountGroup };
