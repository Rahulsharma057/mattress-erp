const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { allowRoles } = require("../middleware/rbac");
const validate = require("../middleware/validate");
const { createPurchaseBillValidator, updatePaymentStatusValidator } = require("../validators/billValidators");
const { createPurchaseBill, getPurchaseBills, getPurchaseBillPayments, updatePaymentStatus, confirmPurchaseOrder, cancelPurchaseBill } = require("../controllers/purchaseBillController");

router.use(protect, allowRoles("super_admin", "admin"));

router.route("/").get(getPurchaseBills).post(createPurchaseBillValidator, validate, createPurchaseBill);
router.get("/:id/payments", getPurchaseBillPayments);
router.put("/:id/payment-status", updatePaymentStatusValidator, validate, updatePaymentStatus);
router.put("/:id/confirm", confirmPurchaseOrder);
router.put("/:id/cancel", cancelPurchaseBill);

module.exports = router;
