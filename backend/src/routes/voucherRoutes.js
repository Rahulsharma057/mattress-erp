const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { allowRoles } = require("../middleware/rbac");
const validate = require("../middleware/validate");
const {
  createVoucherValidator, createCreditNoteValidator, createDebitNoteValidator,
  receivePaymentValidator, makePaymentValidator,
} = require("../validators/billValidators");
const { createVoucher, receivePayment, makePayment, getVouchers, deleteVoucher, getLedgerStatement, getVoucherReceipt } = require("../controllers/voucherController");
const { createCreditNote, createDebitNote, cancelCreditNote, cancelDebitNote } = require("../controllers/creditDebitNoteController");

router.use(protect, allowRoles("super_admin", "admin", "accountant"));

router.route("/").get(getVouchers).post(createVoucherValidator, validate, createVoucher);
router.get("/:id/receipt", getVoucherReceipt);
router.delete("/:id", deleteVoucher);
router.get("/ledger-statement/:ledgerId", getLedgerStatement);
router.post("/credit-notes", createCreditNoteValidator, validate, createCreditNote);
router.post("/debit-notes", createDebitNoteValidator, validate, createDebitNote);
router.delete("/credit-notes/:id", cancelCreditNote);
router.delete("/debit-notes/:id", cancelDebitNote);
router.post("/receive-payment", receivePaymentValidator, validate, receivePayment);
router.post("/make-payment", makePaymentValidator, validate, makePayment);

module.exports = router;
