const asyncHandler = require("express-async-handler");
const Attendance = require("../models/Attendance");

// @desc Mark/create daily attendance entry
const markAttendance = asyncHandler(async (req, res) => {
  const { employee, date, status, shift, checkIn, checkOut, overtimeHours } = req.body;

  const entry = await Attendance.findOneAndUpdate(
    { employee, date },
    { status, shift, checkIn, checkOut, overtimeHours, markedBy: req.user._id },
    { new: true, upsert: true, runValidators: true }
  );

  res.status(201).json(entry);
});

// @desc Get attendance log, filterable by employee/date range
const getAttendance = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.employee) filter.employee = req.query.employee;
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) filter.date.$lte = new Date(req.query.to);
  }

  const logs = await Attendance.find(filter).populate("employee", "name shortName").sort({ date: -1 });
  res.json(logs);
});

// @desc Attendance summary per employee for a given month/year (for salary computation)
const getAttendanceSummary = asyncHandler(async (req, res) => {
  const { employee, month, year } = req.query;
  if (!employee || !month || !year) {
    res.status(400);
    throw new Error("employee, month and year are required");
  }

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const logs = await Attendance.find({ employee, date: { $gte: start, $lte: end } });

  const summary = logs.reduce(
    (acc, log) => {
      acc.totalDays += 1;
      if (log.status === "present") acc.presentDays += 1;
      if (log.status === "half_day") acc.presentDays += 0.5;
      if (log.status === "absent") acc.absentDays += 1;
      if (log.status === "leave") acc.leaveDays += 1;
      acc.overtimeHours += log.overtimeHours || 0;
      return acc;
    },
    { totalDays: 0, presentDays: 0, absentDays: 0, leaveDays: 0, overtimeHours: 0 }
  );

  res.json(summary);
});

module.exports = { markAttendance, getAttendance, getAttendanceSummary };
