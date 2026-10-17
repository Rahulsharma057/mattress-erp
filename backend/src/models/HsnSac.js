const mongoose = require("mongoose");

const hsnSacSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true }, // HSN/SAC Number
    shortName: { type: String },
    sgst: { type: Number, required: true },
    cgst: { type: Number, required: true },
    // igst is auto = sgst + cgst, stored for quick lookup
    igst: { type: Number },
    type: { type: String, enum: ["goods", "service"], required: true },
    unit: { type: String, enum: ["PCS", "other"], default: "PCS" },
  },
  { timestamps: true }
);

hsnSacSchema.pre("save", function (next) {
  this.igst = this.sgst + this.cgst;
  next();
});

module.exports = mongoose.model("HsnSac", hsnSacSchema);
