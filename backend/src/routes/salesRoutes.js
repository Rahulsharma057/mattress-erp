const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { allowRoles } = require("../middleware/rbac");
const validate = require("../middleware/validate");
const { createSalesBillValidator } = require("../validators/billValidators");
const { createSalesBill, getSalesBills, getSalesBillById, getSalesBillPayments, getSalesBillInvoice, confirmSalesOrder, cancelSalesBill } = require("../controllers/salesBillController");

router.use(protect);

router.route("/")
  .get(getSalesBills)
  .post(allowRoles("super_admin", "admin", "salesman", "dealer"), createSalesBillValidator, validate, createSalesBill);
router.get("/:id/payments", getSalesBillPayments);
router.get("/:id/invoice", getSalesBillInvoice);
router.get("/:id", getSalesBillById);
router.put("/:id/confirm", allowRoles("super_admin", "admin", "salesman"), confirmSalesOrder);
router.put("/:id/cancel", allowRoles("super_admin", "admin"), cancelSalesBill);

module.exports = router;
