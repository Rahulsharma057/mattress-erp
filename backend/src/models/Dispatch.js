const mongoose = require("mongoose");

const dispatchSchema = new mongoose.Schema(
  {
    dispatchNumber: { type: String, required: true, unique: true },
    salesBill: { type: mongoose.Schema.Types.ObjectId, ref: "SalesBill", required: true },
    party: { type: mongoose.Schema.Types.ObjectId, ref: "Ledger", required: true },
    packingList: [
      {
        item: { type: mongoose.Schema.Types.ObjectId, ref: "Item" },
        // Which exact size/spec this quantity was dispatched for - see models/ItemVariant.js.
        // Optional so legacy dispatches (created before per-line tracking existed) still load.
        variant: { type: mongoose.Schema.Types.ObjectId, ref: "ItemVariant" },
        // Stable identifier for the EXACT Sales Bill line this quantity came from - see
        // utils/dispatchQuantities.buildLineKey. Absent on dispatches created before this
        // field existed; computeRemainingLines interprets those via FIFO apportionment across
        // the item's lines instead of merging them, so historical quantity is never lost.
        lineKey: { type: String },
        quantity: Number,
      },
    ],
    dispatchType: { type: String, enum: ["party_wise", "office_wise"], required: true },
    status: {
      type: String,
      enum: ["pending", "in_transit", "delivered", "returned"],
      default: "pending",
    },
    dispatchedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    dispatchDate: { type: Date, default: Date.now },
    deliveredDate: { type: Date },

    // Where this specific dispatch actually ships to - captured as a snapshot at the time of
    // dispatch (see dispatchController.createDispatch), never a live read of the Ledger, so
    // editing the dealer's address later never silently changes an already-printed invoice.
    // sameAsBillTo=true (the default) means it was copied from the party's Ledger details at
    // creation time; false means the user entered a different shipping address for this
    // dispatch specifically - either way, every field below is this dispatch's own copy.
    shipTo: {
      sameAsBillTo: { type: Boolean, default: true },
      name: { type: String },
      dealerCode: { type: String },
      address: { type: String },
      city: { type: String },
      state: { type: String },
      pincode: { type: String },
      gstin: { type: String },
      mobile: { type: String },
    },

    // Transport/vehicle details for this dispatch's physical movement - all optional, filled
    // in whenever known (at creation or later, see updateDispatchDetails); never fabricated
    // when unknown. Entering an E-Way Bill number here is just recording it, NOT generating
    // one - this ERP has no E-Way Bill generation/integration to preserve or claim.
    transport: {
      transporterName: { type: String },
      lrNumber: { type: String },
      lrDate: { type: Date },
      vehicleNumber: { type: String },
      ewayBillNumber: { type: String },
      driverName: { type: String },
      driverPhone: { type: String },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Dispatch", dispatchSchema);
