const asyncHandler = require("express-async-handler");
const Employee = require("../models/Employee");
const Attendance = require("../models/Attendance");
const SalarySlip = require("../models/SalarySlip");
const { computeSalary } = require("../services/salaryCalc");
const { generateSalarySlipPDF } = require("../services/pdfGenerator");
const { uploadToCloudinary } = require("../config/cloudinary");

// @desc Generate (or re-generate) a salary slip for one employee for a given month/year
// @route POST /api/salary-slips/generate
// @body { employee, month, year, overtimeRatePerHour, allowances, deductions }
const generateSalarySlip = asyncHandler(async (req, res) => {
  const { employee: employeeId, month, year, overtimeRatePerHour = 0, allowances = [], deductions = [] } = req.body;

  const employee = await Employee.findById(employeeId);
  if (!employee) {
    res.status(404);
    throw new Error("Employee not found");
  }

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);
  const logs = await Attendance.find({ employee: employeeId, date: { $gte: start, $lte: end } });

  const totalDays = new Date(year, month, 0).getDate(); // days in that month
  const presentDays = logs.reduce((sum, l) => {
    if (l.status === "present") return sum + 1;
    if (l.status === "half_day") return sum + 0.5;
    return sum;
  }, 0);
  const overtimeHours = logs.reduce((sum, l) => sum + (l.overtimeHours || 0), 0);

  const calc = computeSalary({
    basicPay: employee.basicPay,
    totalDays,
    presentDays,
    overtimeHours,
    overtimeRatePerHour,
    allowances,
    deductions,
  });

  const slipData = {
    employee: employeeId,
    month,
    year,
    basicPay: employee.basicPay,
    presentDays,
    totalDays,
    overtimeAmount: calc.overtimeAmount,
    allowances,
    deductions,
    grossPay: calc.grossPay,
    totalDeductions: calc.totalDeductions,
    netPay: calc.netPay,
    generatedBy: req.user._id,
  };

  // Generate PDF and upload to Cloudinary
  const pdfBuffer = await generateSalarySlipPDF(slipData, employee);
  const uploadResult = await uploadToCloudinary(pdfBuffer, "mattress-erp/salary-slips");
  slipData.pdfUrl = uploadResult.secure_url;

  const slip = await SalarySlip.findOneAndUpdate(
    { employee: employeeId, month, year },
    slipData,
    { new: true, upsert: true, runValidators: true }
  );

  res.status(201).json(slip);
});

// @desc List salary slips (filter by employee, month, year)
const getSalarySlips = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.employee) filter.employee = req.query.employee;
  if (req.query.month) filter.month = Number(req.query.month);
  if (req.query.year) filter.year = Number(req.query.year);

  const slips = await SalarySlip.find(filter).populate("employee", "name designation").sort({ year: -1, month: -1 });
  res.json(slips);
});

module.exports = { generateSalarySlip, getSalarySlips };
