const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { allowRoles } = require("../middleware/rbac");
const validate = require("../middleware/validate");
const {
  createWorkOrderValidator, advanceStageValidator, createBomValidator, createStockTxnValidator,
} = require("../validators/productionValidators");

const { createBom, getBoms, getBomByItem, updateBom, deleteBom } = require("../controllers/bomController");
const { createStockTransaction, getStockTransactions } = require("../controllers/stockController");
const {
  createWorkOrder, getWorkOrders, getWorkOrderById, advanceStage, cancelWorkOrder,
} = require("../controllers/workOrderController");

router.use(protect, allowRoles("super_admin", "admin", "floor_manager"));

// Bill of Material
router.route("/bom").get(getBoms).post(createBomValidator, validate, createBom);
router.get("/bom/item/:itemId", getBomByItem);
router.route("/bom/:id").put(updateBom).delete(deleteBom);

// Stock (manual movements)
router.route("/stock").get(getStockTransactions).post(createStockTxnValidator, validate, createStockTransaction);

// Work Orders - multi-model, stage-based (planned -> raw material verification -> pasting ->
// stitching -> packing -> ready to dispatch)
router.route("/work-orders").get(getWorkOrders).post(createWorkOrderValidator, validate, createWorkOrder);
router.get("/work-orders/:id", getWorkOrderById);
router.post("/work-orders/:id/advance-stage", advanceStageValidator, validate, advanceStage);
router.post("/work-orders/:id/cancel", cancelWorkOrder);

module.exports = router;
