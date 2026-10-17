const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { allowRoles } = require("../middleware/rbac");
const validate = require("../middleware/validate");
const { uploadCompanyLogo, handleSingleUpload } = require("../middleware/upload");
const { companySettingsValidator } = require("../validators/companySettingsValidators");
const { getCompanySettings, updateCompanySettings, uploadLogo, removeLogo } = require("../controllers/companySettingsController");

router.use(protect);

router.route("/company")
  .get(getCompanySettings)
  .put(allowRoles("super_admin", "admin"), companySettingsValidator, validate, updateCompanySettings);

router.route("/company/logo")
  .post(allowRoles("super_admin", "admin"), handleSingleUpload(uploadCompanyLogo, "logo"), uploadLogo)
  .delete(allowRoles("super_admin", "admin"), removeLogo);

module.exports = router;
