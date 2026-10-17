const { validationResult } = require("express-validator");

// Runs after a chain of express-validator checks; returns 400 with field-level errors.
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  }
  next();
};

module.exports = validate;
