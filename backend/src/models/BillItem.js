const mongoose = require("mongoose");

// Reusable sub-schema for line items on Sales/Purchase bills
const billItemSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true },
    // Which specific size/spec of `item` this line moves - see models/ItemVariant.js. Optional
    // so legacy bills (created before variants existed) still load; every NEW bill resolves
    // this server-side (Purchase/Work Order via getOrCreateVariant, Sales by requiring an
    // existing variant to be selected) - never trust a client-supplied variant without
    // checking it actually belongs to `item`.
    variant: { type: mongoose.Schema.Types.ObjectId, ref: "ItemVariant" },
    length: { type: Number },
    width: { type: Number },
    thickness: { type: Number },
    density: { type: Number },
    quantity: { type: Number, required: true },
    rate: { type: Number, required: true },
    sgst: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    amount: { type: Number, required: true }, // qty * rate + taxes
  },
  { _id: false }
);

module.exports = billItemSchema;
