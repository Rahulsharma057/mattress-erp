const express = require("express");
const router = express.Router();
const { createUser, getUsers, updateUser, deleteUser } = require("../controllers/userController");
const { protect } = require("../middleware/auth");
const { allowRoles } = require("../middleware/rbac");
const { createUserValidator, updateUserValidator } = require("../validators/userValidators");
const validate = require("../middleware/validate");

router.use(protect, allowRoles("super_admin"));

router.route("/").get(getUsers).post(createUserValidator, validate, createUser);
router.route("/:id").put(updateUserValidator, validate, updateUser).delete(deleteUser);

module.exports = router;
