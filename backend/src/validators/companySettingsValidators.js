const { body } = require("express-validator");

const companySettingsValidator = [
  body("email").optional({ checkFalsy: true }).isEmail().withMessage("Invalid email address"),
  body("termsAndConditions").optional().isArray().withMessage("Terms & Conditions must be a list of lines"),
  body("termsAndConditions.*").optional({ checkFalsy: true }).isString(),
];

module.exports = { companySettingsValidator };
