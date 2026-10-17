const mongoose = require("mongoose");

// Model-wise line items - a single Work Order can cover multiple product models at once
// (e.g. 12 different mattress models), each with its own planned/produced/scrap quantity.
const workOrderItemSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true },
    // The manufacturing specification being produced on this line - captured HERE at Work
    // Order time, not on the general Item Master (see models/ItemVariant.js). All optional:
    // a work order for an unsized/raw item simply resolves to that item's single
    // "Unspecified" variant. Resolved server-side into `variant` when the work order is
    // created (see workOrderController.createWorkOrder) - finished-goods stock on
    // advanceStage's ready_to_dispatch transition credits THIS variant, never the item as a
    // single merged bucket.
    length: { type: Number },
    width: { type: Number },
    thickness: { type: Number },
    density: { type: Number },
    unit: { type: String, default: "inch" },
    variant: { type: mongoose.Schema.Types.ObjectId, ref: "ItemVariant" },
    plannedQty: { type: Number, required: true },
    producedQty: { type: Number, default: 0 },
    scrapQty: { type: Number, default: 0 },
  },
  { _id: false }
);

// The real mattress/foam production pipeline, in order. "ready_to_dispatch" is the final
// stage - moving into it is when raw materials actually get consumed and finished goods
// actually get credited to stock (see workOrderController.advanceStage).
const STAGES = [
  "planned", "raw_material_verification", "pasting", "stitching",
  "packing", "ready_to_dispatch", "cancelled",
];

const workOrderSchema = new mongoose.Schema(
  {
    workOrderNumber: { type: String, required: true, unique: true },
    items: { type: [workOrderItemSchema], validate: (v) => v.length > 0 },
    currentStage: { type: String, enum: STAGES, default: "planned" },
    // Full audit trail of every stage transition - answers "where is this work order right
    // now, and who moved it, and when" for the complete record view.
    stageHistory: [
      {
        stage: { type: String, enum: STAGES },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        changedAt: { type: Date, default: Date.now },
        remarks: { type: String },
      },
    ],
    scheduledDate: { type: Date, required: true },
    completedDate: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WorkOrder", workOrderSchema);
module.exports.STAGES = STAGES;
