const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { allowRoles } = require("../middleware/rbac");
const validate = require("../middleware/validate");
const {
  createAccountGroupValidator, updateAccountGroupValidator,
  createLedgerValidator, updateLedgerValidator,
  createItemValidator, updateItemValidator,
  createHsnValidator, updateHsnValidator,
} = require("../validators/masterValidators");

const {
  createAccountGroup, getAccountGroups, updateAccountGroup, deleteAccountGroup,
} = require("../controllers/accountGroupController");

const {
  createLedger, getLedgers, getLedgerById, updateLedger, deleteLedger, getLedgerTransactions,
  getOpenInvoices, getOpenPurchaseBills, getAging, getDealerHistory,
} = require("../controllers/ledgerController");

const { createHsn, getHsnList, updateHsn, deleteHsn } = require("../controllers/hsnController");
const { createItem, getItems, updateItem, deleteItem, getItemVariants } = require("../controllers/itemController");

router.use(protect);

// Account Groups - admin/super_admin only for write, everyone with access can read
router.route("/account-groups")
  .get(getAccountGroups)
  .post(allowRoles("super_admin", "admin"), createAccountGroupValidator, validate, createAccountGroup);
router.route("/account-groups/:id")
  .put(allowRoles("super_admin", "admin"), updateAccountGroupValidator, validate, updateAccountGroup)
  .delete(allowRoles("super_admin", "admin"), deleteAccountGroup);

// Ledgers - Party/Dealer/Distributor master
router.route("/ledgers")
  .get(getLedgers)
  .post(allowRoles("super_admin", "admin"), createLedgerValidator, validate, createLedger);
router.route("/ledgers/:id")
  .get(getLedgerById)
  .put(allowRoles("super_admin", "admin"), updateLedgerValidator, validate, updateLedger)
  .delete(allowRoles("super_admin", "admin"), deleteLedger);
router.get("/ledgers/:id/transactions", getLedgerTransactions);
router.get("/ledgers/:id/open-invoices", getOpenInvoices);
router.get("/ledgers/:id/open-purchase-bills", getOpenPurchaseBills);
router.get("/ledgers/:id/aging", getAging);
router.get("/ledgers/:id/dealer-history", getDealerHistory);

// HSN/SAC
router.route("/hsn")
  .get(getHsnList)
  .post(allowRoles("super_admin", "admin"), createHsnValidator, validate, createHsn);
router.route("/hsn/:id")
  .put(allowRoles("super_admin", "admin"), updateHsnValidator, validate, updateHsn)
  .delete(allowRoles("super_admin", "admin"), deleteHsn);

// Items
router.route("/items")
  .get(getItems)
  .post(allowRoles("super_admin", "admin", "floor_manager"), createItemValidator, validate, createItem);
router.route("/items/:id")
  .put(allowRoles("super_admin", "admin", "floor_manager"), updateItemValidator, validate, updateItem)
  .delete(allowRoles("super_admin", "admin"), deleteItem);
router.get("/items/:id/variants", getItemVariants);

module.exports = router;
