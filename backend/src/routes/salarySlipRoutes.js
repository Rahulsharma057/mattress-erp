const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { allowRoles } = require("../middleware/rbac");
const { generateSalarySlipValidator } = require("../validators/hrValidators");
const validate = require("../middleware/validate");
const { generateSalarySlip, getSalarySlips } = require("../controllers/salarySlipController");

router.use(protect);

router.post("/generate", allowRoles("super_admin", "admin"), generateSalarySlipValidator, validate, generateSalarySlip);
router.get("/", getSalarySlips); // employees can view their own via ?employee= filter (add ownership check later)

module.exports = router;
