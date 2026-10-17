const mongoose = require("mongoose");

const visitSchema = new mongoose.Schema(
  {
    salesman: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    party: { type: mongoose.Schema.Types.ObjectId, ref: "Ledger", required: true },
    visitTime: { type: Date, default: Date.now },
    location: {
      lat: Number,
      lng: Number,
    },
    orderPlaced: { type: mongoose.Schema.Types.ObjectId, ref: "SalesBill" },
    // collectionAmount is kept for backward compatibility / quick display on the visit log,
    // but it is NOT the source of truth for money received - see the linked Collection
    // document (pending accountant approval before it posts a Receipt voucher).
    collectionAmount: { type: Number, default: 0 },
    // Named collectionRecord, not "collection" - Mongoose reserves `collection` as a
    // Document property (the underlying MongoDB collection handle), so that name silently
    // shadows it instead of behaving as a normal schema field.
    collectionRecord: { type: mongoose.Schema.Types.ObjectId, ref: "Collection" },
    remarks: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Visit", visitSchema);
