const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { allowRoles } = require("../middleware/rbac");

const {
  getSalesDashboard, getPurchaseDashboard, getSalesReport,
  getGstr1Report, getFinancialStatement, getSalaryRegister, getStockReport,
  getDayBook, getTrialBalance, getCollectionsSummary, getPartyBalances, getCashFlow,
} = require("../controllers/reportController");

router.use(protect, allowRoles("super_admin", "admin", "accountant", "floor_manager", "dispatch_manager"));

router.get("/sales-dashboard", getSalesDashboard);
router.get("/purchase-dashboard", getPurchaseDashboard);
router.get("/sales", getSalesReport);
router.get("/gstr1", getGstr1Report);
router.get("/financial-statement", getFinancialStatement);
router.get("/hr/salary-register", allowRoles("super_admin", "admin", "accountant"), getSalaryRegister);
router.get("/stock", getStockReport);
router.get("/collections-summary", getCollectionsSummary);
router.get("/day-book", allowRoles("super_admin", "admin", "accountant"), getDayBook);
router.get("/trial-balance", allowRoles("super_admin", "admin", "accountant"), getTrialBalance);
router.get("/party-balances", getPartyBalances);
router.get("/cash-flow", allowRoles("super_admin", "admin", "accountant"), getCashFlow);

module.exports = router;
