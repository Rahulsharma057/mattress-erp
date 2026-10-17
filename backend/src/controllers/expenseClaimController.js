const asyncHandler = require("express-async-handler");
const ExpenseClaim = require("../models/ExpenseClaim");
const Ledger = require("../models/Ledger");
const Voucher = require("../models/Voucher");
const generateBillNumber = require("../utils/generateBillNumber");
const { applyLedgerDelta } = require("./voucherController");
const withTransaction = require("../utils/withTransaction");

// Default ledger names seeded by seedMasters.js - used to auto-post the payment voucher
// once an expense claim clears final (Super Admin) approval. If a deployment has renamed
// or removed these ledgers, the claim still gets approved - it just skips auto-posting and
// the amount can be recorded manually via a Payment voucher on the Accounts screen instead.
const CASH_LEDGER_NAME = "Cash Account";
const EXPENSE_LEDGER_NAME = "Staff & Field Expenses";

const createExpenseClaim = asyncHandler(async (req, res) => {
  const salesman = req.user.role === "salesman" ? req.user._id : req.body.salesman;
  const { date, category, amount, receiptUrl, remarks } = req.body;
  const claim = await ExpenseClaim.create({ salesman, date, category, amount, receiptUrl, remarks });
  res.status(201).json(claim);
});

const getExpenseClaims = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === "salesman") filter.salesman = req.user._id;
  else if (req.query.salesman) filter.salesman = req.query.salesman;
  if (req.query.status) filter.status = req.query.status;

  const claims = await ExpenseClaim.find(filter)
    .populate("salesman", "name")
    .populate("adminApprovedBy", "name")
    .populate("superAdminApprovedBy", "name")
    .sort({ date: -1 });
  res.json(claims);
});

// @desc Two-level expense claim approval:
//   1. An Admin must approve first (pending -> admin_approved)
//   2. A Super Admin gives the final approval (admin_approved -> approved), which auto-posts
//      a Payment voucher (debits the expense ledger, credits Cash) so it flows straight into
//      Accounts without a separate manual entry.
//   Either stage can reject instead, which ends the flow regardless of the other stage.
// @route PUT /api/salesman/expense-claims/:id/review
// @body { status: "approved" | "rejected" }
const reviewExpenseClaim = asyncHandler(async (req, res) => {
  const claim = await ExpenseClaim.findById(req.params.id);
  if (!claim) {
    res.status(404);
    throw new Error("Expense claim not found");
  }

  const { status } = req.body;
  const role = req.user.role; // "admin" or "super_admin" (allowRoles already restricts to these + super_admin's implicit access)

  if (status === "rejected") {
    if (claim.status === "approved" || claim.status === "rejected") {
      res.status(400);
      throw new Error(`This claim is already '${claim.status}' and cannot be rejected now`);
    }
    claim.status = "rejected";
    claim.rejectedBy = req.user._id;
    claim.rejectedAt = new Date();
    claim.rejectionStage = role === "super_admin" ? "super_admin" : "admin";
    await claim.save();
    return res.json(claim);
  }

  // status === "approved" - enforce the two-stage sequence
  if (role !== "admin" && role !== "super_admin") {
    res.status(403);
    throw new Error("Only Admin or Super Admin can approve expense claims");
  }

  if (role === "admin") {
    if (claim.status !== "pending") {
      res.status(400);
      throw new Error(`This claim is at '${claim.status}' stage - only a pending claim can be admin-approved`);
    }
    claim.status = "admin_approved";
    claim.adminApprovedBy = req.user._id;
    claim.adminApprovedAt = new Date();
    await claim.save();
    return res.json(claim);
  }

  // role === "super_admin": final approval
  if (claim.status === "pending") {
    res.status(400);
    throw new Error("This claim needs Admin approval first, before Super Admin can give final approval");
  }
  if (claim.status !== "admin_approved") {
    res.status(400);
    throw new Error(`This claim is already '${claim.status}' and cannot be approved again`);
  }

  claim.status = "approved";
  claim.superAdminApprovedBy = req.user._id;
  claim.superAdminApprovedAt = new Date();

  // Auto-post a Payment voucher: debit the expense ledger, credit Cash - mirrors how a
  // salesman's field collection auto-posts a Receipt voucher (see visitController.createVisit).
  // Voucher + both ledger legs + the claim's own approved status commit together - a crash
  // partway through can never leave a voucher posted without the claim marked approved.
  const [cashLedger, expenseLedger] = await Promise.all([
    Ledger.findOne({ name: CASH_LEDGER_NAME }),
    Ledger.findOne({ name: EXPENSE_LEDGER_NAME }),
  ]);
  if (cashLedger && expenseLedger) {
    await withTransaction(async (session) => {
      const voucherNumber = await generateBillNumber(Voucher, "PAY", "voucherNumber");
      const [voucher] = await Voucher.create([{
        voucherType: "payment",
        voucherNumber,
        date: new Date(),
        ledger: expenseLedger._id,
        amount: claim.amount,
        drCr: "debit",
        counterLedger: cashLedger._id,
        narration: `Expense reimbursement - ${claim.category} claim, approved`,
        source: "expense_approval",
        createdBy: req.user._id,
      }], { session });
      await applyLedgerDelta(expenseLedger._id, claim.amount, "debit", session);
      await applyLedgerDelta(cashLedger._id, claim.amount, "credit", session);
      claim.paymentVoucher = voucher._id;
      await claim.save({ session });
    });
  } else {
    await claim.save();
  }

  res.json(claim);
});

module.exports = { createExpenseClaim, getExpenseClaims, reviewExpenseClaim };
