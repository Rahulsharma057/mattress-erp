const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Central roles used across the whole system for RBAC.
const ROLES = [
  "super_admin",
  "admin",
  "floor_manager",
  "dispatch_manager",
  "accountant",
  "salesman",
  "dealer",
  "employee",
];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ROLES, required: true, default: "employee" },

    // Optional link to a more detailed Employee profile (HR module)
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },

    // Optional link to a Ledger, when a Dealer logs in as a "user"
    dealerLedger: { type: mongoose.Schema.Types.ObjectId, ref: "Ledger" },

    // Custom per-module UI permissions, set by Super Admin (Users Master & Role Management)
    permissions: {
      type: Map,
      of: new mongoose.Schema(
        {
          view: { type: Boolean, default: false },
          create: { type: Boolean, default: false },
          edit: { type: Boolean, default: false },
          delete: { type: Boolean, default: false },
        },
        { _id: false }
      ),
      default: {},
    },

    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// Never send the password hash back in API responses
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model("User", userSchema);
module.exports.ROLES = ROLES;
