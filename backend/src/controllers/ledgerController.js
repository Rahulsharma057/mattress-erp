const asyncHandler = require("express-async-handler");
const Ledger = require("../models/Ledger");
const SalesBill = require("../models/SalesBill");
const PurchaseBill = require("../models/PurchaseBill");
const Voucher = require("../models/Voucher");
const Collection = require("../models/Collection");
const Visit = require("../models/Visit");
const generateBillNumber = require("../utils/generateBillNumber");
const paginate = require("../utils/paginate");
const { getOpenInvoicesForParty, getAgingForParty, getOpenBillsForSupplier, getPayableAgingForSupplier } = require("../services/outstandingCalc");
const { partyGroupFilter } = require("../utils/partyLedgerFilter");

// @desc Create a new Ledger (Dealer/Supplier/Party)
const createLedger = asyncHandler(async (req, res) => {
  const dealerCode = await generateBillNumber(Ledger, "DLR", "dealerCode", 6);
  const salesmanHistory = req.body.salesman ? [{ salesman: req.body.salesman, assignedFrom: new Date(), assignedTo: null }] : [];
  const ledger = await Ledger.create({ ...req.body, dealerCode, salesmanHistory });
  res.status(201).json(ledger);
});

// @desc List ledgers, optionally filter by salesman (?salesman=<userId>) and/or search by
//       name/code/mobile/GSTIN (?search=). Every dropdown/picker across the app (Sales,
//       Purchase, Accounts, Salesman App, Collection Approvals...) calls this with no `page`
//       - it keeps the old plain-array shape, capped at a sane limit, so none of those call
//       sites had to change. The Ledger/Dealer Master screen passes `page`/`limit`/`search`
//       explicitly and gets back a real paginated, server-searched page instead.
// @route GET /api/masters/ledgers?salesman=&search=&entityType=&page=&limit=
const getLedgers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.salesman) filter.salesman = req.query.salesman;
  // `entityType` alone is not trustworthy for "give me only real dealers/suppliers" - see
  // partyLedgerFilter.js - so a request that explicitly asks for one side also requires
  // group membership, which keeps Cash/Bank/Sales/Purchase/GST ledgers out of it.
  if (req.query.entityType) Object.assign(filter, await partyGroupFilter(req.query.entityType));
  if (req.query.search) {
    const safe = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // escape regex metachars
    const re = new RegExp(safe, "i");
    filter.$or = [{ name: re }, { dealerCode: re }, { mobile: re }, { gstin: re }];
  }

  const query = Ledger.find(filter)
    .populate("accountGroup", "name nature")
    .populate("salesman", "name email")
    .sort({ name: 1 });

  if (!req.query.page) {
    const ledgers = await query.limit(500);
    return res.json(ledgers);
  }

  const { data, pagination } = await paginate(query, req.query);
  res.json({ ledgers: data, pagination });
});

const getLedgerById = asyncHandler(async (req, res) => {
  const ledger = await Ledger.findById(req.params.id)
    .populate("accountGroup")
    .populate("salesman", "name email");
  if (!ledger) {
    res.status(404);
    throw new Error("Ledger not found");
  }
  res.json(ledger);
});

// Salesman assignment changes are tracked as history, not just overwritten - see
// Ledger.salesmanHistory. Historical sales/visits/collections already store their own
// salesman reference directly, so this never rewrites past transactions; it only answers
// "who was assigned, and when" for Dealer 360.
const updateLedger = asyncHandler(async (req, res) => {
  const ledger = await Ledger.findById(req.params.id);
  if (!ledger) {
    res.status(404);
    throw new Error("Ledger not found");
  }

  const newSalesman = req.body.salesman === "" ? undefined : req.body.salesman;
  const salesmanChanged = "salesman" in req.body && String(ledger.salesman || "") !== String(newSalesman || "");

  Object.assign(ledger, req.body);
  if (salesmanChanged) {
    ledger.salesman = newSalesman;
    const open = ledger.salesmanHistory.find((h) => !h.assignedTo);
    if (open) open.assignedTo = new Date();
    if (newSalesman) ledger.salesmanHistory.push({ salesman: newSalesman, assignedFrom: new Date(), assignedTo: null });
  }

  await ledger.save();
  res.json(ledger);
});

const deleteLedger = asyncHandler(async (req, res) => {
  const ledger = await Ledger.findByIdAndDelete(req.params.id);
  if (!ledger) {
    res.status(404);
    throw new Error("Ledger not found");
  }
  res.json({ message: "Ledger deleted" });
});

// @desc Dealer/Customer 360 view: every Sales Bill, Purchase Bill, and Voucher (payments,
//       receipts, credit/debit notes) involving this ledger, merged chronologically with a
//       running balance - "where does this dealer's/supplier's whole history live" in one place.
// @route GET /api/masters/ledgers/:id/transactions
const getLedgerTransactions = asyncHandler(async (req, res) => {
  const ledger = await Ledger.findById(req.params.id);
  if (!ledger) {
    res.status(404);
    throw new Error("Ledger not found");
  }

  const [salesBills, purchaseBills, vouchers] = await Promise.all([
    // Only a true credit sale ("sales_bill") ever debits this party's ledger - a draft
    // "sale_order" has no ledger effect yet, and a "cash_sale" settles straight to Cash/Bank
    // instead (see accountingPostings.postSalesBillAccounting), so neither belongs on this
    // dealer's statement.
    SalesBill.find({ party: ledger._id, billType: "sales_bill", status: { $ne: "cancelled" } }).populate("items.item", "name"),
    // Only a real "purchase_bill" (not a draft "purchase_order") ever credits the supplier's
    // ledger - and a cancelled one has already been reversed, so it must not show twice.
    PurchaseBill.find({ supplier: ledger._id, billType: "purchase_bill", status: { $ne: "cancelled" } }).populate("items.item", "name"),
    Voucher.find({ $or: [{ ledger: ledger._id }, { counterLedger: ledger._id }] }),
  ]);

  const events = [];
  for (const b of salesBills) {
    events.push({ type: "sales_bill", date: b.date, reference: b.billNumber, description: `Sale - ${b.items.length} item line(s)`, amount: b.totalAmount, drCr: "debit" });
  }
  for (const b of purchaseBills) {
    events.push({ type: "purchase_bill", date: b.date, reference: b.billNumber, description: `Purchase - ${b.items.length} item line(s)`, amount: b.totalAmount, drCr: "credit" });
  }
  for (const v of vouchers) {
    const isPrimary = String(v.ledger) === String(ledger._id);
    const effectiveDrCr = isPrimary ? v.drCr : (v.drCr === "debit" ? "credit" : "debit");
    events.push({ type: v.voucherType, date: v.date, reference: v.voucherNumber, description: v.narration || v.voucherType.replace("_", " "), amount: v.amount, drCr: effectiveDrCr });
  }

  events.sort((a, b) => new Date(a.date) - new Date(b.date));

  let running = ledger.openingBalance || 0;
  for (const e of events) {
    running += e.drCr === "debit" ? e.amount : -e.amount;
    e.runningBalance = running;
  }

  // Summary strip for Dealer 360: Opening/Sales/Receipts/Credit Notes/Debit Notes are each
  // summed straight off the same events list above (so it can never disagree with the
  // statement itself), while Outstanding is read from the ledger's own posted balance and
  // Overdue comes from the aging calc (receivable for a dealer, payable for a supplier -
  // see outstandingCalc.getAgingForParty / getPayableAgingForSupplier).
  const sumByType = (type) => events.filter((e) => e.type === type).reduce((t, e) => t + e.amount, 0);
  const overdueAmount = ledger.entityType === "dealer"
    ? (await getAgingForParty(ledger._id)).overdueAmount
    : (await getPayableAgingForSupplier(ledger._id)).overdueAmount;

  res.json({
    ledger: { name: ledger.name, dealerCode: ledger.dealerCode, entityType: ledger.entityType, openingBalance: ledger.openingBalance, currentBalance: ledger.currentBalance, creditLimit: ledger.creditLimit },
    summary: {
      openingBalance: ledger.openingBalance || 0,
      totalSales: sumByType("sales_bill"),
      totalPurchases: sumByType("purchase_bill"),
      totalReceipts: sumByType("receipt"),
      totalPayments: sumByType("payment"),
      totalCreditNotes: sumByType("credit_note"),
      totalDebitNotes: sumByType("debit_note"),
      currentOutstanding: ledger.currentBalance,
      overdueAmount,
    },
    events: events.reverse(), // most recent first
  });
});

// @desc Dealer 360 - full relationship history: every salesman ever assigned and when,
//       collections (pending/approved/rejected) logged against this dealer, what items/qty
//       they've actually bought, and recent field visits. Built entirely from existing data -
//       nothing here is a new document type, just a cross-cutting read. Open to ANY
//       authenticated role (see routes) - a salesman covering for a colleague, or an
//       accountant, can look up a dealer they aren't personally assigned to; the actual
//       write actions (approve collection, override credit limit, etc.) still enforce their
//       own RBAC separately wherever they're performed.
// @route GET /api/masters/ledgers/:id/dealer-history
const getDealerHistory = asyncHandler(async (req, res) => {
  const ledger = await Ledger.findById(req.params.id).populate("salesmanHistory.salesman", "name");
  if (!ledger) {
    res.status(404);
    throw new Error("Ledger not found");
  }

  const [collections, itemsSummary, visits] = await Promise.all([
    Collection.find({ party: ledger._id }).populate("salesman", "name").sort({ date: -1 }).limit(50),
    SalesBill.aggregate([
      { $match: { party: ledger._id, billType: { $ne: "sale_order" }, status: { $ne: "cancelled" } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.item", totalQty: { $sum: "$items.quantity" }, totalAmount: { $sum: "$items.amount" } } },
      { $lookup: { from: "items", localField: "_id", foreignField: "_id", as: "item" } },
      { $unwind: "$item" },
      { $project: { name: "$item.name", unit: "$item.unit", totalQty: 1, totalAmount: 1 } },
      { $sort: { totalAmount: -1 } },
    ]),
    Visit.find({ party: ledger._id }).populate("salesman", "name").sort({ visitTime: -1 }).limit(20),
  ]);

  const collectionsSummary = { pending_approval: 0, approved: 0, rejected: 0 };
  for (const c of collections) collectionsSummary[c.status] = (collectionsSummary[c.status] || 0) + c.amount;

  res.json({
    salesmanHistory: ledger.salesmanHistory
      .slice()
      .sort((a, b) => new Date(b.assignedFrom) - new Date(a.assignedFrom))
      .map((h) => ({ salesman: h.salesman, assignedFrom: h.assignedFrom, assignedTo: h.assignedTo })),
    collectionsSummary,
    collections: collections.map((c) => ({
      _id: c._id, date: c.date, amount: c.amount, status: c.status,
      salesman: c.salesman, paymentMode: c.paymentMode,
    })),
    itemsSummary,
    visits: visits.map((v) => ({ _id: v._id, visitTime: v.visitTime, salesman: v.salesman, remarks: v.remarks })),
  });
});

// @desc Open (not fully-allocated) Sales Bills for a party, with per-invoice outstanding -
//       used by the Salesman App to let a collection be tied to specific invoice(s) instead
//       of only landing as an on-account/advance amount. See services/outstandingCalc.
// @route GET /api/masters/ledgers/:id/open-invoices
const getOpenInvoices = asyncHandler(async (req, res) => {
  const invoices = await getOpenInvoicesForParty(req.params.id);
  res.json(invoices.filter((i) => i.outstandingAmount > 0));
});

// @desc Mirror of getOpenInvoices for the payable side - open Purchase Bills for a supplier,
//       used by the "Make Payment" screen to let a payment be tied to specific bill(s).
// @route GET /api/masters/ledgers/:id/open-purchase-bills
const getOpenPurchaseBills = asyncHandler(async (req, res) => {
  const bills = await getOpenBillsForSupplier(req.params.id);
  res.json(bills.filter((b) => b.outstandingAmount > 0));
});

// @desc Dealer 360 - Aging tab: invoice-wise receivables aging for a dealer, or bill-wise
//       payables aging for a supplier (0-30/31-60/61-90/91-180/180+).
// @route GET /api/masters/ledgers/:id/aging
const getAging = asyncHandler(async (req, res) => {
  const ledger = await Ledger.findById(req.params.id);
  if (!ledger) {
    res.status(404);
    throw new Error("Ledger not found");
  }
  res.json(ledger.entityType === "dealer" ? await getAgingForParty(ledger._id) : await getPayableAgingForSupplier(ledger._id));
});

module.exports = {
  createLedger, getLedgers, getLedgerById, updateLedger, deleteLedger, getLedgerTransactions,
  getOpenInvoices, getOpenPurchaseBills, getAging, getDealerHistory,
};