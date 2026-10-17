const mongoose = require("mongoose");

const routePlanSchema = new mongoose.Schema(
  {
    salesman: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true },
    plannedParties: [{ type: mongoose.Schema.Types.ObjectId, ref: "Ledger" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("RoutePlan", routePlanSchema);
