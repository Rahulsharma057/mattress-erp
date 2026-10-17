const { body } = require("express-validator");
const { ROLES } = require("../models/User");

const createUserValidator = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("email").isEmail().withMessage("A valid email is required").normalizeEmail(),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("role").isIn(ROLES).withMessage(`Role must be one of: ${ROLES.join(", ")}`),
];

const updateUserValidator = [
  body("role").optional().isIn(ROLES).withMessage(`Role must be one of: ${ROLES.join(", ")}`),
  body("password").optional().isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
];

module.exports = { createUserValidator, updateUserValidator };
