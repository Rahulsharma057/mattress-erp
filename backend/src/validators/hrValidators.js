const { body } = require("express-validator");

const createEmployeeValidator = [
  body("name").trim().notEmpty().withMessage("Employee name is required"),
  body("doj").isISO8601().withMessage("A valid date of joining is required"),
  body("basicPay").isFloat({ gt: 0 }).withMessage("Basic pay must be greater than 0"),
  body("loginEmail").if((value, { req }) => req.body.createLogin === true).isEmail().withMessage("A valid login email is required"),
  body("loginPassword").if((value, { req }) => req.body.createLogin === true).isLength({ min: 6 }).withMessage("Login password must be at least 6 characters"),
];

const createDepartmentValidator = [
  body("name").trim().notEmpty().withMessage("Department name is required"),
];

const markAttendanceValidator = [
  body("employee").isMongoId().withMessage("A valid employee is required"),
  body("date").isISO8601().withMessage("A valid date is required"),
  body("status").isIn(["present", "absent", "half_day", "leave", "holiday"]).withMessage("Invalid attendance status"),
];

const generateSalarySlipValidator = [
  body("employee").isMongoId().withMessage("A valid employee is required"),
  body("month").isInt({ min: 1, max: 12 }).withMessage("Month must be between 1 and 12"),
  body("year").isInt({ min: 2000, max: 2100 }).withMessage("A valid year is required"),
];

module.exports = { createEmployeeValidator, createDepartmentValidator, markAttendanceValidator, generateSalarySlipValidator };
