const mongoose = require("mongoose");

const bomSchema = new mongoose.Schema(
  {
    finishedItem: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true }, // e.g. Mattress
    components: [
      {
        item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true }, // e.g. Foam sheet
        quantityRequired: { type: Number, required: true },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("BillOfMaterial", bomSchema);
