const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { allowRoles } = require("../middleware/rbac");
const validate = require("../middleware/validate");
const { markAttendanceValidator } = require("../validators/hrValidators");
const { markAttendance, getAttendance, getAttendanceSummary } = require("../controllers/attendanceController");

router.use(protect);

router.get("/summary", getAttendanceSummary);
router.route("/")
  .get(getAttendance)
  .post(allowRoles("super_admin", "admin", "floor_manager"), markAttendanceValidator, validate, markAttendance);

module.exports = router;
