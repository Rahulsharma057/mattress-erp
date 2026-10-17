const mongoose = require("mongoose");

const salarySlipSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    month: { type: Number, required: true }, // 1-12
    year: { type: Number, required: true },

    basicPay: { type: Number, required: true },
    presentDays: { type: Number, required: true },
    totalDays: { type: Number, required: true },
    overtimeAmount: { type: Number, default: 0 },
    allowances: [{ label: String, amount: Number }],
    deductions: [{ label: String, amount: Number }],

    grossPay: { type: Number, required: true },
    totalDeductions: { type: Number, required: true },
    netPay: { type: Number, required: true },

    // PDF generated and uploaded to Cloudinary
    pdfUrl: { type: String },

    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

salarySlipSchema.index({ employee: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model("SalarySlip", salarySlipSchema);
