const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { allowRoles } = require("../middleware/rbac");
const validate = require("../middleware/validate");
const { createVisitValidator, createRoutePlanValidator, createExpenseClaimValidator, reviewExpenseClaimValidator, reviewCollectionValidator } = require("../validators/salesmanValidators");

const { createRoutePlan, getRoutePlans } = require("../controllers/routePlanController");
const { createVisit, getVisits } = require("../controllers/visitController");
const { createExpenseClaim, getExpenseClaims, reviewExpenseClaim } = require("../controllers/expenseClaimController");
const { getCollections, reviewCollection } = require("../controllers/collectionController");

router.use(protect);

// Route Plans
router.route("/route-plans")
  .get(allowRoles("super_admin", "admin", "salesman"), getRoutePlans)
  .post(allowRoles("super_admin", "admin", "salesman"), createRoutePlanValidator, validate, createRoutePlan);

// Visit Logging
router.route("/visits")
  .get(allowRoles("super_admin", "admin", "salesman"), getVisits)
  .post(allowRoles("super_admin", "admin", "salesman"), createVisitValidator, validate, createVisit);

// Expense Claims
router.route("/expense-claims")
  .get(allowRoles("super_admin", "admin", "salesman"), getExpenseClaims)
  .post(allowRoles("super_admin", "admin", "salesman"), createExpenseClaimValidator, validate, createExpenseClaim);
router.put("/expense-claims/:id/review", allowRoles("super_admin", "admin"), reviewExpenseClaimValidator, validate, reviewExpenseClaim);

// Collections (field collections awaiting accounts approval before they post to the ledger).
// Created automatically by createVisit above - there is no direct POST /collections.
router.get("/collections", allowRoles("super_admin", "admin", "accountant", "salesman"), getCollections);
router.put("/collections/:id/review", allowRoles("super_admin", "admin", "accountant"), reviewCollectionValidator, validate, reviewCollection);

module.exports = router;
