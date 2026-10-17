const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { allowRoles } = require("../middleware/rbac");
const validate = require("../middleware/validate");
const { createEmployeeValidator, createDepartmentValidator } = require("../validators/hrValidators");

const {
  createEmployee, getEmployees, getEmployeeById, updateEmployee, deleteEmployee,
} = require("../controllers/employeeController");
const {
  createDepartment, getDepartments, updateDepartment, deleteDepartment,
} = require("../controllers/departmentController");

router.use(protect);

router.route("/departments")
  .get(getDepartments)
  .post(allowRoles("super_admin", "admin"), createDepartmentValidator, validate, createDepartment);
router.route("/departments/:id")
  .put(allowRoles("super_admin", "admin"), updateDepartment)
  .delete(allowRoles("super_admin", "admin"), deleteDepartment);

router.route("/")
  .get(allowRoles("super_admin", "admin", "floor_manager"), getEmployees)
  .post(allowRoles("super_admin", "admin"), createEmployeeValidator, validate, createEmployee);
router.route("/:id")
  .get(allowRoles("super_admin", "admin", "floor_manager"), getEmployeeById)
  .put(allowRoles("super_admin", "admin"), updateEmployee)
  .delete(allowRoles("super_admin", "admin"), deleteEmployee);

module.exports = router;
