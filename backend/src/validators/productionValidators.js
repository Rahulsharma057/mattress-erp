const { body } = require("express-validator");

const createWorkOrderValidator = [
  body("workOrderNumber").trim().notEmpty().withMessage("Work order number is required"),
  body("scheduledDate").isISO8601().withMessage("A valid scheduled date is required"),
  body("items").isArray({ min: 1 }).withMessage("At least one model/item line is required"),
  body("items.*.item").isMongoId().withMessage("Each line needs a valid item"),
  body("items.*.plannedQty").isFloat({ gt: 0 }).withMessage("Planned quantity must be greater than 0 for every model"),
];

const advanceStageValidator = [
  body("remarks").optional().isString(),
  body("itemsProduced").optional().isArray().withMessage("itemsProduced must be a list"),
  body("itemsProduced.*.item").optional().isMongoId().withMessage("Each produced line needs a valid item"),
  body("itemsProduced.*.producedQty").optional().isFloat({ min: 0 }).withMessage("Produced quantity cannot be negative"),
  body("itemsProduced.*.scrapQty").optional().isFloat({ min: 0 }).withMessage("Scrap quantity cannot be negative"),
];

const createBomValidator = [
  body("finishedItem").isMongoId().withMessage("A valid finished item is required"),
  body("components").isArray({ min: 1 }).withMessage("At least one component is required"),
  body("components.*.item").isMongoId().withMessage("Each component needs a valid item"),
  body("components.*.quantityRequired").isFloat({ gt: 0 }).withMessage("Component quantity must be greater than 0"),
];

const createStockTxnValidator = [
  body("type").isIn(["receive", "scrap_issue", "scrap_return", "stock_adjustment"]).withMessage("Invalid stock transaction type"),
  body("item").isMongoId().withMessage("A valid item is required"),
  body("quantity").isFloat({ gt: 0 }).withMessage("Quantity must be greater than 0"),
  body("direction").if(body("type").equals("stock_adjustment")).isIn(["increase", "decrease"]).withMessage("Direction (increase/decrease) is required for a stock adjustment"),
  body("remarks").if(body("type").equals("stock_adjustment")).trim().notEmpty().withMessage("A reason is required for a stock adjustment"),
];

module.exports = { createWorkOrderValidator, advanceStageValidator, createBomValidator, createStockTxnValidator };
