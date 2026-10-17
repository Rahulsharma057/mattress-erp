const { body } = require("express-validator");

const createSalesBillValidator = [
  body("party").isMongoId().withMessage("A valid party (ledger) is required"),
  body("items").isArray({ min: 1 }).withMessage("At least one item line is required"),
  body("items.*.item").isMongoId().withMessage("Each line needs a valid item"),
  body("items.*.quantity").isFloat({ gt: 0 }).withMessage("Quantity must be greater than 0"),
  body("items.*.rate").isFloat({ min: 0 }).withMessage("Rate cannot be negative"),
  body("paymentMode").optional().isIn(["cash", "bank"]).withMessage("Invalid payment mode"),
  body("overrideCreditLimit").optional().isBoolean(),
  body("overrideReason").optional().isString(),
];

const createPurchaseBillValidator = [
  body("supplier").isMongoId().withMessage("A valid supplier (ledger) is required"),
  body("items").isArray({ min: 1 }).withMessage("At least one item line is required"),
  body("items.*.item").isMongoId().withMessage("Each line needs a valid item"),
  body("items.*.quantity").isFloat({ gt: 0 }).withMessage("Quantity must be greater than 0"),
  body("items.*.rate").isFloat({ min: 0 }).withMessage("Rate cannot be negative"),
];

const updatePaymentStatusValidator = [
  body("paymentStatus").isIn(["pending", "partial", "paid"]).withMessage("Invalid payment status"),
];

const createVoucherValidator = [
  body("voucherType").isIn(["receipt", "payment", "credit_note", "debit_note", "contra", "journal"]).withMessage("Invalid voucher type"),
  body("ledger").isMongoId().withMessage("A valid Debit/Credit account is required"),
  body("amount").isFloat({ gt: 0 }).withMessage("Amount must be greater than 0"),
  body("drCr").isIn(["debit", "credit"]).withMessage("drCr must be debit or credit"),
  // No more single-sided/"direct" postings: every voucher must name BOTH accounts (which
  // one it came from, which one it went to) - this is what makes it a real double-entry, not
  // just a balance bump on one ledger. Contra/Journal already required this; Receipt/Payment
  // now do too.
  body("counterLedger").isMongoId().withMessage("The other account (where the money is coming from / going to) is required")
    .custom((value, { req }) => String(value) !== String(req.body.ledger)).withMessage("The two accounts on a voucher must be different"),
];

const createCreditNoteValidator = [
  body("party").isMongoId().withMessage("A valid party is required"),
  body("items").isArray({ min: 1 }).withMessage("At least one item line is required"),
  body("items.*.item").isMongoId().withMessage("Each line needs a valid item"),
  body("items.*.quantity").isFloat({ gt: 0 }).withMessage("Quantity must be greater than 0"),
  body("items.*.rate").isFloat({ min: 0 }).withMessage("Rate cannot be negative"),
  body("items.*.sgst").optional().isFloat({ min: 0 }).withMessage("SGST % cannot be negative"),
  body("items.*.cgst").optional().isFloat({ min: 0 }).withMessage("CGST % cannot be negative"),
  body("items.*.igst").optional().isFloat({ min: 0 }).withMessage("IGST % cannot be negative"),
  body("salesBillRef").optional({ checkFalsy: true }).isMongoId().withMessage("Invalid sales bill reference"),
];

const createDebitNoteValidator = [
  body("party").isMongoId().withMessage("A valid party is required"),
  body("items").isArray({ min: 1 }).withMessage("At least one item line is required"),
  body("items.*.item").isMongoId().withMessage("Each line needs a valid item"),
  body("items.*.quantity").isFloat({ gt: 0 }).withMessage("Quantity must be greater than 0"),
  body("items.*.rate").isFloat({ min: 0 }).withMessage("Rate cannot be negative"),
  body("items.*.sgst").optional().isFloat({ min: 0 }).withMessage("SGST % cannot be negative"),
  body("items.*.cgst").optional().isFloat({ min: 0 }).withMessage("CGST % cannot be negative"),
  body("items.*.igst").optional().isFloat({ min: 0 }).withMessage("IGST % cannot be negative"),
  body("purchaseBillRef").optional({ checkFalsy: true }).isMongoId().withMessage("Invalid purchase bill reference"),
];

const receivePaymentValidator = [
  body("party").isMongoId().withMessage("A valid dealer is required"),
  body("amount").isFloat({ gt: 0 }).withMessage("Amount must be greater than 0"),
  body("paymentMode").isIn(["cash", "upi", "bank_transfer", "neft", "rtgs", "cheque", "other"]).withMessage("Invalid payment mode"),
  body("settlementLedger").optional().isMongoId().withMessage("Invalid settlement account"),
  body("allocations").optional().isArray().withMessage("allocations must be a list"),
  body("allocations.*.salesBill").optional().isMongoId().withMessage("Each allocation needs a valid sales bill"),
  body("allocations.*.amount").optional().isFloat({ gt: 0 }).withMessage("Each allocation amount must be greater than 0"),
];

const makePaymentValidator = [
  body("supplier").isMongoId().withMessage("A valid supplier is required"),
  body("amount").isFloat({ gt: 0 }).withMessage("Amount must be greater than 0"),
  body("paymentMode").isIn(["cash", "upi", "bank_transfer", "neft", "rtgs", "cheque", "other"]).withMessage("Invalid payment mode"),
  body("settlementLedger").optional().isMongoId().withMessage("Invalid settlement account"),
  body("allocations").optional().isArray().withMessage("allocations must be a list"),
  body("allocations.*.purchaseBill").optional().isMongoId().withMessage("Each allocation needs a valid purchase bill"),
  body("allocations.*.amount").optional().isFloat({ gt: 0 }).withMessage("Each allocation amount must be greater than 0"),
];

module.exports = {
  createSalesBillValidator, createPurchaseBillValidator, updatePaymentStatusValidator,
  createVoucherValidator, createCreditNoteValidator, createDebitNoteValidator,
  receivePaymentValidator, makePaymentValidator,
};
