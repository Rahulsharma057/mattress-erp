// Run once: node src/seed/seedSuperAdmin.js
require("dotenv").config();
const connectDB = require("../config/db");
const User = require("../models/User");

(async () => {
  await connectDB();

  const email = "admin@sunrisefoam.com";
  const exists = await User.findOne({ email });

  if (exists) {
    console.log("Super Admin already exists:", email);
    process.exit(0);
  }

  await User.create({
    name: "Super Admin",
    email,
    password: "Admin@123", // change immediately after first login
    role: "super_admin",
  });

  console.log("Super Admin created:", email, "/ password: Admin@123");
  process.exit(0);
})();
