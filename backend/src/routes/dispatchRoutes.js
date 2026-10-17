const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { allowRoles } = require("../middleware/rbac");
const validate = require("../middleware/validate");
const { createDispatchValidator, updateDispatchStatusValidator, updateDispatchDetailsValidator } = require("../validators/dispatchValidators");
const { getDispatchableBills, createDispatch, getDispatches, updateDispatchStatus, updateDispatchDetails, getDispatchInvoice } = require("../controllers/dispatchController");

router.use(protect, allowRoles("super_admin", "admin", "dispatch_manager"));

router.get("/dispatchable-bills", getDispatchableBills);
router.route("/").get(getDispatches).post(createDispatchValidator, validate, createDispatch);
router.get("/:id/invoice", getDispatchInvoice);
router.put("/:id/status", updateDispatchStatusValidator, validate, updateDispatchStatus);
router.put("/:id/details", updateDispatchDetailsValidator, validate, updateDispatchDetails);

module.exports = router;
