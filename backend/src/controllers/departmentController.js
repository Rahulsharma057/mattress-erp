const asyncHandler = require("express-async-handler");
const Department = require("../models/Department");

const createDepartment = asyncHandler(async (req, res) => {
  const dept = await Department.create(req.body);
  res.status(201).json(dept);
});

const getDepartments = asyncHandler(async (req, res) => {
  res.json(await Department.find());
});

const updateDepartment = asyncHandler(async (req, res) => {
  const dept = await Department.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!dept) {
    res.status(404);
    throw new Error("Department not found");
  }
  res.json(dept);
});

const deleteDepartment = asyncHandler(async (req, res) => {
  const dept = await Department.findByIdAndDelete(req.params.id);
  if (!dept) {
    res.status(404);
    throw new Error("Department not found");
  }
  res.json({ message: "Department deleted" });
});

module.exports = { createDepartment, getDepartments, updateDepartment, deleteDepartment };
