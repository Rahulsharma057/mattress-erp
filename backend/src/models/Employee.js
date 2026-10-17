const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Personal Profile
    name: { type: String, required: true },
    shortName: { type: String },
    email: { type: String },
    phone: { type: String },
    permanentAddress: { type: String },
    localAddress: { type: String },
    dob: { type: Date },
    doj: { type: Date, required: true }, // Date of Joining

    // Work Profile
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
    designation: { type: String },

    // Bank Details
    bank: {
      accountHolderName: String,
      bankName: String,
      accountNumber: String,
      ifscCode: String,
      branchName: String,
    },

    // Salary Structure
    basicPay: { type: Number, required: true, default: 0 },
    allowanceAdvanceAllowed: { type: Boolean, default: false },

    // Documents (Cloudinary URLs)
    documents: [
      {
        name: String,
        url: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Employee", employeeSchema);
