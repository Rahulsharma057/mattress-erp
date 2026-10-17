const express = require("express");
const router = express.Router();
const { login, getMe } = require("../controllers/authController");
const { protect } = require("../middleware/auth");
const { loginLimiter } = require("../middleware/rateLimiters");
const { loginValidator } = require("../validators/authValidators");
const validate = require("../middleware/validate");

router.post("/login", loginLimiter, loginValidator, validate, login);
router.get("/me", protect, getMe);

module.exports = router;
