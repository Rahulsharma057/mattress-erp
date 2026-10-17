const asyncHandler = require("express-async-handler");
const Employee = require("../models/Employee");
const User = require("../models/User");

// @desc Create employee profile, optionally linking/creating a login User
const createEmployee = asyncHandler(async (req, res) => {
  const { createLogin, loginEmail, loginPassword, loginRole, ...employeeData } = req.body;

  const employee = await Employee.create(employeeData);

  if (createLogin) {
    if (!loginEmail || !loginPassword) {
      res.status(400);
      throw new Error("loginEmail and loginPassword are required to create a login for this employee");
    }
    const user = await User.create({
      name: employee.name,
      email: loginEmail,
      password: loginPassword,
      role: loginRole || "employee",
      employee: employee._id,
    });
    employee.user = user._id;
    await employee.save();
  }

  res.status(201).json(employee);
});

const getEmployees = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.department) filter.department = req.query.department;
  if (req.query.active !== undefined) filter.isActive = req.query.active === "true";

  const employees = await Employee.find(filter).populate("department", "name").populate("user", "email role");
  res.json(employees);
});

const getEmployeeById = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id).populate("department").populate("user", "email role");
  if (!employee) {
    res.status(404);
    throw new Error("Employee not found");
  }
  res.json(employee);
});

const updateEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id);
  if (!employee) {
    res.status(404);
    throw new Error("Employee not found");
  }
  Object.assign(employee, req.body);
  await employee.save();
  res.json(employee);
});

const deleteEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findByIdAndDelete(req.params.id);
  if (!employee) {
    res.status(404);
    throw new Error("Employee not found");
  }
  res.json({ message: "Employee deleted" });
});

module.exports = { createEmployee, getEmployees, getEmployeeById, updateEmployee, deleteEmployee };
