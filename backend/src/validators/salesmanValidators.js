const { body } = require("express-validator");

const createVisitValidator = [
  body("party").isMongoId().withMessage("A valid party is required"),
  body("collectionAmount").optional().isFloat({ min: 0 }).withMessage("Collection amount cannot be negative"),
  body("paymentMode").optional().isIn(["cash", "upi", "bank_transfer", "neft", "rtgs", "cheque", "other"]).withMessage("Invalid payment mode"),
  body("allocations").optional().isArray().withMessage("allocations must be a list"),
  body("allocations.*.salesBill").optional().isMongoId().withMessage("Each allocation needs a valid sales bill"),
  body("allocations.*.amount").optional().isFloat({ gt: 0 }).withMessage("Each allocation amount must be greater than 0"),
];

const reviewCollectionValidator = [
  body("status").isIn(["approved", "rejected"]).withMessage("Status must be approved or rejected"),
  body("rejectionReason").if(body("status").equals("rejected")).optional().isString(),
];

const createRoutePlanValidator = [
  body("date").isISO8601().withMessage("A valid date is required"),
  body("plannedParties").optional().isArray().withMessage("plannedParties must be a list of ledger ids"),
  body("salesman").if((value, { req }) => req.user.role !== "salesman").isMongoId().withMessage("A valid salesman is required when an admin creates a route plan on their behalf"),
];

const createExpenseClaimValidator = [
  body("category").isIn(["travel", "food", "lodging", "other"]).withMessage("Invalid expense category"),
  body("amount").isFloat({ gt: 0 }).withMessage("Amount must be greater than 0"),
];

const reviewExpenseClaimValidator = [
  body("status").isIn(["approved", "rejected"]).withMessage("Status must be approved or rejected"),
];

module.exports = { createVisitValidator, createRoutePlanValidator, createExpenseClaimValidator, reviewExpenseClaimValidator, reviewCollectionValidator };
