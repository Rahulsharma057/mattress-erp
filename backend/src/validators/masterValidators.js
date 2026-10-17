const { body } = require("express-validator");

const NATURES = ["asset", "liability", "income", "expense", "equity"];
const { STANDARD_GROUPS } = require("../models/AccountGroup");

const createAccountGroupValidator = [
  body("name").trim().notEmpty().withMessage("Account group name is required"),
  body("nature").isIn(NATURES).withMessage(`Nature must be one of: ${NATURES.join(", ")}`),
  body("parentGroup").optional().isIn(STANDARD_GROUPS).withMessage("Invalid parent (Under) group"),
];
const updateAccountGroupValidator = [
  body("nature").optional().isIn(NATURES).withMessage(`Nature must be one of: ${NATURES.join(", ")}`),
  body("parentGroup").optional().isIn(STANDARD_GROUPS).withMessage("Invalid parent (Under) group"),
];

// Dispatch address, credit limit, and dealer/wholesale-retail type only make sense for a
// Dealer or Supplier - a standalone "individual" account (an employee advance, a petty-cash
// custodian, a personal ledger) has none of that, so these are required ONLY when entityType
// is dealer/supplier, never unconditionally. Still validated for FORMAT whenever given either way.
const isNotIndividual = body("entityType").not().equals("individual");

const createLedgerValidator = [
  body("name").trim().notEmpty().withMessage("Account/Party name is required"),
  body("entityType").optional().isIn(["dealer", "supplier", "individual"]).withMessage("Entity type must be dealer, supplier, or individual"),
  body("dealerType").optional({ checkFalsy: true }).isIn(["wholesale", "retail"]).withMessage("Dealer type must be wholesale or retail"),
  body("accountGroup").isMongoId().withMessage("A valid account group is required"),
  body("mobile").if(isNotIndividual).notEmpty().withMessage("Mobile number is required").bail().isMobilePhone("any").withMessage("Invalid mobile number"),
  body("mobile").optional({ checkFalsy: true }).isMobilePhone("any").withMessage("Invalid mobile number"),
  body("email").optional({ checkFalsy: true }).isEmail().withMessage("Invalid email"),
  body("gstin").optional({ checkFalsy: true }).isLength({ min: 15, max: 15 }).withMessage("GSTIN must be 15 characters"),
  body("address").if(isNotIndividual).trim().notEmpty().withMessage("Billing address is required"),
  body("city").if(isNotIndividual).trim().notEmpty().withMessage("City is required"),
  body("pincode").if(isNotIndividual).trim().notEmpty().withMessage("PIN code is required"),
  body("state").if(isNotIndividual).trim().notEmpty().withMessage("State is required"),
  body("creditLimit").if(isNotIndividual).isFloat({ min: 0 }).withMessage("Credit limit is required and cannot be negative"),
  body("creditLimit").optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage("Credit limit cannot be negative"),
  body("salesman").optional({ checkFalsy: true }).isMongoId().withMessage("Invalid salesman"),
  body("bankIfscCode").optional({ checkFalsy: true }).matches(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/).withMessage("Invalid IFSC code (format: ABCD0123456)"),
  body("bankAccountNumber").optional({ checkFalsy: true }).isLength({ min: 6, max: 20 }).withMessage("Invalid bank account number"),
];
const updateLedgerValidator = [
  body("name").optional().trim().notEmpty().withMessage("Account/Party name cannot be empty"),
  body("entityType").optional().isIn(["dealer", "supplier", "individual"]).withMessage("Entity type must be dealer, supplier, or individual"),
  body("dealerType").optional({ checkFalsy: true }).isIn(["wholesale", "retail"]).withMessage("Dealer type must be wholesale or retail"),
  body("accountGroup").optional().isMongoId().withMessage("A valid account group is required"),
  body("mobile").optional({ checkFalsy: true }).isMobilePhone("any").withMessage("Invalid mobile number"),
  body("email").optional({ checkFalsy: true }).isEmail().withMessage("Invalid email"),
  body("ledgerType").optional().isIn(["registered", "unregistered"]).withMessage("GST treatment must be registered or unregistered"),
  body("creditLimit").optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage("Credit limit cannot be negative"),
  body("salesman").optional({ checkFalsy: true }).isMongoId().withMessage("Invalid salesman"),
  body("bankIfscCode").optional({ checkFalsy: true }).matches(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/).withMessage("Invalid IFSC code (format: ABCD0123456)"),
  body("bankAccountNumber").optional({ checkFalsy: true }).isLength({ min: 6, max: 20 }).withMessage("Invalid bank account number"),
];

const ITEM_CATEGORIES = ["mattress", "foam_sheet", "pillow", "cushion", "raw_material", "other"];
const createItemValidator = [
  body("name").trim().notEmpty().withMessage("Product name is required"),
  body("hsn").isMongoId().withMessage("A valid HSN/SAC is required"),
  body("unit").trim().notEmpty().withMessage("Unit is required"),
  body("mrp").optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage("MRP cannot be negative"),
  body("purchaseRate").optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage("Purchase rate cannot be negative"),
  body("rateA").optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage("Rate A cannot be negative"),
  body("rateB").optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage("Rate B cannot be negative"),
  body("warrantyMonths").optional({ checkFalsy: true }).isInt({ min: 0 }).withMessage("Warranty (months) cannot be negative"),
];
const updateItemValidator = [
  body("hsn").optional().isMongoId().withMessage("A valid HSN/SAC is required"),
  body("category").optional().isIn(ITEM_CATEGORIES).withMessage(`Category must be one of: ${ITEM_CATEGORIES.join(", ")}`),
  body("stockQty").optional().isFloat().withMessage("Stock quantity must be a number"),
  body("mrp").optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage("MRP cannot be negative"),
  body("purchaseRate").optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage("Purchase rate cannot be negative"),
];

const createHsnValidator = [
  body("code").trim().notEmpty().withMessage("HSN/SAC code is required"),
  body("sgst").isFloat({ min: 0, max: 100 }).withMessage("SGST must be between 0 and 100"),
  body("cgst").isFloat({ min: 0, max: 100 }).withMessage("CGST must be between 0 and 100"),
  body("type").isIn(["goods", "service"]).withMessage("Type must be goods or service"),
];
const updateHsnValidator = [
  body("sgst").optional().isFloat({ min: 0, max: 100 }).withMessage("SGST must be between 0 and 100"),
  body("cgst").optional().isFloat({ min: 0, max: 100 }).withMessage("CGST must be between 0 and 100"),
  body("type").optional().isIn(["goods", "service"]).withMessage("Type must be goods or service"),
];

module.exports = {
  createAccountGroupValidator, updateAccountGroupValidator,
  createLedgerValidator, updateLedgerValidator,
  createItemValidator, updateItemValidator,
  createHsnValidator, updateHsnValidator,
};
