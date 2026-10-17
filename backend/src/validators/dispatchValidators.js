const { body } = require("express-validator");

// Shared by createDispatchValidator and updateDispatchDetailsValidator - every field here is
// optional (never fabricated when the user doesn't know it yet), but format-checked when
// actually provided, per the explicit requirement to validate LR date, vehicle number and
// driver phone.
const shipToAndTransportValidators = [
  body("shipTo.sameAsBillTo").optional().isBoolean().withMessage("shipTo.sameAsBillTo must be true/false"),
  body("shipTo.mobile").optional({ checkFalsy: true }).isString(),
  body("shipTo.gstin").optional({ checkFalsy: true }).isString(),
  body("transport.lrDate").optional({ checkFalsy: true }).isISO8601().withMessage("LR Date must be a valid date"),
  body("transport.vehicleNumber").optional({ checkFalsy: true })
    .customSanitizer((v) => String(v).replace(/[\s-]/g, "").toUpperCase())
    .matches(/^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{1,4}$/)
    .withMessage("Invalid vehicle number format (expected e.g. UP81BT3635)"),
  body("transport.driverPhone").optional({ checkFalsy: true })
    .matches(/^[0-9]{10}$/).withMessage("Driver phone must be a 10-digit number"),
];

const createDispatchValidator = [
  body("salesBill").isMongoId().withMessage("A valid sales bill is required"),
  body("party").isMongoId().withMessage("A valid party is required"),
  body("dispatchType").isIn(["party_wise", "office_wise"]).withMessage("Invalid dispatch type"),
  body("packingList").isArray({ min: 1 }).withMessage("Packing list cannot be empty"),
  body("packingList.*.item").isMongoId().withMessage("Each packing list line needs a valid item"),
  body("packingList.*.quantity").isFloat({ gt: 0 }).withMessage("Each packing list line quantity must be greater than 0"),
  // Identifies exactly which Sales Bill line this quantity is for (see
  // utils/dispatchQuantities.buildLineKey) - optional for backward compatibility with an
  // older caller that only sends {item, quantity}, see dispatchController.createDispatch.
  body("packingList.*.lineKey").optional({ checkFalsy: true }).isString(),
  ...shipToAndTransportValidators,
];

const updateDispatchStatusValidator = [
  body("status").isIn(["pending", "in_transit", "delivered", "returned"]).withMessage("Invalid dispatch status"),
];

// Deliberately does NOT accept packingList/salesBill/party/status - this endpoint only ever
// edits shipTo/transport, see dispatchController.updateDispatchDetails.
const updateDispatchDetailsValidator = [...shipToAndTransportValidators];

module.exports = { createDispatchValidator, updateDispatchStatusValidator, updateDispatchDetailsValidator };
