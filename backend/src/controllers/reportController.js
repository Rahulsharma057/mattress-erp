const asyncHandler = require("express-async-handler");
const SalesBill = require("../models/SalesBill");
const PurchaseBill = require("../models/PurchaseBill");
const Ledger = require("../models/Ledger");
const AccountGroup = require("../models/AccountGroup");
const Item = require("../models/Item");
const Dispatch = require("../models/Dispatch");
const SalarySlip = require("../models/SalarySlip");
const Voucher = require("../models/Voucher");
const Collection = require("../models/Collection");
const { partyGroupFilter } = require("../utils/partyLedgerFilter");

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };
const startOfMonth = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; };

// @desc Sales Dashboard: today's sales, sales in a selectable period, outstanding, dealers,
//       product-wise sales, dispatching summary.
// @route GET /api/reports/sales-dashboard?from=&to=
//   `from`/`to` scope "Sales in Period" and "Product-wise Sales" only - Today's Sales,
//   Outstanding, and Total Dealers are always "right now" figures regardless of the filter.
const getSalesDashboard = asyncHandler(async (req, res) => {
  // "sale_order" is a draft with no stock/ledger effect yet (see salesBillController) - it
  // must never be counted as an actual sale here, or the dashboard overstates real revenue.
  const REAL_SALE = { status: { $ne: "cancelled" }, billType: { $ne: "sale_order" } };
  const { from, to } = req.query;
  const periodMatch = { ...REAL_SALE };
  if (from || to) {
    periodMatch.date = {};
    if (from) periodMatch.date.$gte = new Date(from);
    if (to) periodMatch.date.$lte = new Date(to);
  }

  const [todaySalesAgg] = await SalesBill.aggregate([
    { $match: { ...REAL_SALE, date: { $gte: startOfToday(), $lte: endOfToday() } } },
    { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
  ]);

  const [periodSalesAgg] = await SalesBill.aggregate([
    { $match: periodMatch },
    { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
  ]);

  const dealerFilter = await partyGroupFilter("dealer");
  const totalDealers = await Ledger.countDocuments({ isActive: true, ...dealerFilter });

  // Outstanding = sum of positive (debit) balances across DEALER ledgers only. Matching on
  // entityType alone isn't enough - Cash Account/Bank Account default to entityType "dealer"
  // too (see utils/partyLedgerFilter) and legitimately carry a large positive balance as
  // real cash/bank holdings, not money owed by a dealer - so they must also be excluded by
  // requiring the "Sundry Debtors" account group.
  const [outstandingAgg] = await Ledger.aggregate([
    { $match: { ...dealerFilter, currentBalance: { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: "$currentBalance" } } },
  ]);

  const productWiseSales = await SalesBill.aggregate([
    { $match: periodMatch },
    { $unwind: "$items" },
    { $group: { _id: "$items.item", totalQty: { $sum: "$items.quantity" }, totalAmount: { $sum: "$items.amount" } } },
    { $lookup: { from: "items", localField: "_id", foreignField: "_id", as: "item" } },
    { $unwind: "$item" },
    { $project: { name: "$item.name", totalQty: 1, totalAmount: 1 } },
    { $sort: { totalAmount: -1 } },
    { $limit: 10 },
  ]);

  const dispatchSummary = await Dispatch.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  res.json({
    todaysSales: todaySalesAgg?.total || 0,
    todaysSalesCount: todaySalesAgg?.count || 0,
    periodSales: periodSalesAgg?.total || 0,
    periodSalesCount: periodSalesAgg?.count || 0,
    totalOutstanding: outstandingAgg?.total || 0,
    totalDealers,
    productWiseSales,
    dispatchSummary: dispatchSummary.reduce((acc, d) => ({ ...acc, [d._id]: d.count }), {}),
  });
});

// @desc Collections Dashboard: pending/approved/rejected counts and amounts - used by the
//       main Dashboard's Collections card row.
// @route GET /api/reports/collections-summary
const getCollectionsSummary = asyncHandler(async (req, res) => {
  const byStatus = await Collection.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$amount" } } },
  ]);
  const summary = { pending_approval: { count: 0, total: 0 }, approved: { count: 0, total: 0 }, rejected: { count: 0, total: 0 } };
  for (const row of byStatus) {
    if (summary[row._id]) summary[row._id] = { count: row.count, total: row.total };
  }
  res.json(summary);
});

// @desc Purchase Dashboard: today's/monthly purchase, total purchase, payment paid/pending
// @route GET /api/reports/purchase-dashboard
const getPurchaseDashboard = asyncHandler(async (req, res) => {
  // "purchase_order" is a draft with no stock/ledger effect yet (see purchaseBillController) -
  // it must never be counted as an actual purchase here.
  const REAL_PURCHASE = { billType: { $ne: "purchase_order" }, status: { $ne: "cancelled" } };

  const [todayAgg] = await PurchaseBill.aggregate([
    { $match: { ...REAL_PURCHASE, date: { $gte: startOfToday(), $lte: endOfToday() } } },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
  ]);

  const [monthAgg] = await PurchaseBill.aggregate([
    { $match: { ...REAL_PURCHASE, date: { $gte: startOfMonth() } } },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
  ]);

  const [totalAgg] = await PurchaseBill.aggregate([
    { $match: REAL_PURCHASE },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
  ]);

  const paymentByStatus = await PurchaseBill.aggregate([
    { $match: REAL_PURCHASE },
    { $group: { _id: "$paymentStatus", total: { $sum: "$totalAmount" } } },
  ]);
  const paid = paymentByStatus.find((p) => p._id === "paid")?.total || 0;
  const pending = (paymentByStatus.find((p) => p._id === "pending")?.total || 0)
    + (paymentByStatus.find((p) => p._id === "partial")?.total || 0);

  const recentPurchases = await PurchaseBill.find(REAL_PURCHASE).populate("supplier", "name").sort({ date: -1 }).limit(10);

  res.json({
    todaysPurchase: todayAgg?.total || 0,
    monthlyPurchase: monthAgg?.total || 0,
    totalPurchaseUptoDate: totalAgg?.total || 0,
    totalPaymentPaid: paid,
    totalPaymentPending: pending,
    recentPurchases,
  });
});

// @desc Sales report - grouped by day or by party or by product
// @route GET /api/reports/sales?groupBy=day|party|product&from=&to=
const getSalesReport = asyncHandler(async (req, res) => {
  const { groupBy = "day", from, to } = req.query;
  // "sale_order" is a draft with no stock/ledger effect yet - excluded from real sales figures.
  const match = { status: { $ne: "cancelled" }, billType: { $ne: "sale_order" } };
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = new Date(from);
    if (to) match.date.$lte = new Date(to);
  }

  let pipeline = [{ $match: match }];
  if (groupBy === "party") {
    pipeline.push(
      { $group: { _id: "$party", total: { $sum: "$totalAmount" }, bills: { $sum: 1 } } },
      { $lookup: { from: "ledgers", localField: "_id", foreignField: "_id", as: "party" } },
      { $unwind: "$party" },
      { $project: { partyName: "$party.name", total: 1, bills: 1 } },
      { $sort: { total: -1 } }
    );
  } else if (groupBy === "product") {
    pipeline.push(
      { $unwind: "$items" },
      { $group: { _id: "$items.item", totalQty: { $sum: "$items.quantity" }, total: { $sum: "$items.amount" } } },
      { $lookup: { from: "items", localField: "_id", foreignField: "_id", as: "item" } },
      { $unwind: "$item" },
      { $project: { itemName: "$item.name", totalQty: 1, total: 1 } },
      { $sort: { total: -1 } }
    );
  } else {
    pipeline.push(
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }, total: { $sum: "$totalAmount" }, bills: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    );
  }

  res.json(await SalesBill.aggregate(pipeline));
});

// @desc GSTR-1 style report: outward supplies grouped by HSN & tax rate
// @route GET /api/reports/gstr1?from=&to=
const getGstr1Report = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  // "sale_order" is a draft with no stock/ledger effect yet - excluded from actual outward supply.
  const match = { status: { $ne: "cancelled" }, billType: { $ne: "sale_order" } };
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = new Date(from);
    if (to) match.date.$lte = new Date(to);
  }

  const rows = await SalesBill.aggregate([
    { $match: match },
    { $unwind: "$items" },
    { $lookup: { from: "items", localField: "items.item", foreignField: "_id", as: "itemDoc" } },
    { $unwind: "$itemDoc" },
    { $lookup: { from: "hsnsacs", localField: "itemDoc.hsn", foreignField: "_id", as: "hsnDoc" } },
    { $unwind: "$hsnDoc" },
    {
      $group: {
        _id: "$hsnDoc.code",
        taxableValue: { $sum: { $multiply: ["$items.quantity", "$items.rate"] } },
        totalAmount: { $sum: "$items.amount" },
        sgstRate: { $first: "$hsnDoc.sgst" },
        cgstRate: { $first: "$hsnDoc.cgst" },
        igstRate: { $first: "$hsnDoc.igst" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json(rows);
});

// @desc Financial statements: simplified Balance Sheet + P&L from Ledger balances grouped by
//       AccountGroup nature (asset/liability/income/expense/equity)
// @route GET /api/reports/financial-statement
const getFinancialStatement = asyncHandler(async (req, res) => {
  const rows = await Ledger.aggregate([
    { $lookup: { from: "accountgroups", localField: "accountGroup", foreignField: "_id", as: "group" } },
    { $unwind: "$group" },
    { $group: { _id: "$group.nature", total: { $sum: "$currentBalance" }, ledgers: { $push: { name: "$name", balance: "$currentBalance" } } } },
  ]);

  const byNature = rows.reduce((acc, r) => ({ ...acc, [r._id]: { total: r.total, ledgers: r.ledgers } }), {});

  res.json({
    balanceSheet: {
      assets: byNature.asset || { total: 0, ledgers: [] },
      liabilities: byNature.liability || { total: 0, ledgers: [] },
      equity: byNature.equity || { total: 0, ledgers: [] },
    },
    profitAndLoss: {
      income: byNature.income || { total: 0, ledgers: [] },
      expense: byNature.expense || { total: 0, ledgers: [] },
      netProfit: (byNature.income?.total || 0) - (byNature.expense?.total || 0),
    },
  });
});

// @desc Inventory report: items at or below their reorder level, and overall stock value
//       (using each item's purchase rate) - "Low Stock Alert" from the Reports checklist.
// @route GET /api/reports/stock
const getStockReport = asyncHandler(async (req, res) => {
  const items = await Item.find({ isActive: true }).select("name unit stockQty reorderLevel purchaseRate productCode");

  const lowStock = items
    .filter((i) => i.reorderLevel > 0 && i.stockQty <= i.reorderLevel)
    .map((i) => ({ _id: i._id, name: i.name, unit: i.unit, stockQty: i.stockQty, reorderLevel: i.reorderLevel }));

  const totalStockValue = items.reduce((sum, i) => sum + i.stockQty * (i.purchaseRate || 0), 0);

  res.json({ totalItems: items.length, totalStockValue, lowStock });
});

// @desc Day Book: every POSTED accounting transaction (Vouchers, plus Sales/Purchase Bills,
//       which post directly without a separate Voucher document - see accountingPostings),
//       merged chronologically with a resolved Debit/Credit account pair each. Since every
//       posting in this system is balanced by construction, totalDebit always equals
//       totalCredit here - if they ever don't, something upstream broke double-entry.
// @route GET /api/reports/day-book?from=&to=
const getDayBook = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = {};
  if (from) dateFilter.$gte = new Date(from);
  if (to) dateFilter.$lte = new Date(to);
  const dateMatch = Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {};

  const [vouchers, salesBills, purchaseBills] = await Promise.all([
    Voucher.find(dateMatch).populate("ledger", "name").populate("counterLedger", "name").sort({ date: 1 }),
    SalesBill.find({ ...dateMatch, billType: { $in: ["sales_bill", "cash_sale"] }, status: { $ne: "cancelled" } }).populate("party", "name").sort({ date: 1 }),
    PurchaseBill.find({ ...dateMatch, billType: "purchase_bill", status: { $ne: "cancelled" } }).populate("supplier", "name").sort({ date: 1 }),
  ]);

  const entries = [];
  for (const v of vouchers) {
    const debitAccount = v.drCr === "debit" ? v.ledger?.name : v.counterLedger?.name;
    const creditAccount = v.drCr === "debit" ? v.counterLedger?.name : v.ledger?.name;
    entries.push({ date: v.date, reference: v.voucherNumber, type: v.voucherType, debitAccount, creditAccount, amount: v.amount, narration: v.narration });
  }
  for (const b of salesBills) {
    entries.push({
      date: b.date, reference: b.billNumber, type: b.billType,
      debitAccount: b.billType === "cash_sale" ? "Cash/Bank" : b.party?.name,
      creditAccount: "Sales Account & Output GST",
      amount: b.totalAmount, narration: `Sale - ${b.items.length} item line(s)`,
    });
  }
  for (const b of purchaseBills) {
    entries.push({
      date: b.date, reference: b.billNumber, type: "purchase_bill",
      debitAccount: "Purchase Account & Input GST", creditAccount: b.supplier?.name,
      amount: b.totalAmount, narration: `Purchase - ${b.items.length} item line(s)`,
    });
  }

  entries.sort((a, b) => new Date(a.date) - new Date(b.date));
  const total = Math.round(entries.reduce((t, e) => t + e.amount, 0) * 100) / 100;
  res.json({ entries, totalDebit: total, totalCredit: total });
});

// @desc Trial Balance: every Ledger's balance shown on its natural Debit or Credit side.
//       currentBalance is a signed "debit-positive" number (see voucherController.
//       applyLedgerDelta) - positive means a debit balance, negative means credit. Because
//       every posting in this system is balanced Dr=Cr, the two columns always net to the
//       same total; this is a genuine reconciliation check, not a display trick.
// @route GET /api/reports/trial-balance
const getTrialBalance = asyncHandler(async (req, res) => {
  const ledgers = await Ledger.find().populate("accountGroup", "name nature").sort({ name: 1 });

  let totalDebit = 0;
  let totalCredit = 0;
  const rows = ledgers
    .map((l) => {
      const balance = l.currentBalance || 0;
      const debit = balance > 0 ? balance : 0;
      const credit = balance < 0 ? -balance : 0;
      totalDebit += debit;
      totalCredit += credit;
      return { ledger: l.name, group: l.accountGroup?.name, nature: l.accountGroup?.nature, debit, credit };
    })
    .filter((r) => r.debit !== 0 || r.credit !== 0);

  res.json({
    rows,
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
  });
});

// @desc Debtors (dealers who owe us) and Creditors (suppliers we owe) as two separate,
//       clean lists - instead of one mixed "outstanding" figure. This is the per-party
//       breakdown behind the (now-fixed) Dashboard "Total Outstanding" card.
// @route GET /api/reports/party-balances
const getPartyBalances = asyncHandler(async (req, res) => {
  // entityType alone would also pick up Cash/Bank/Sales/Purchase/GST ledgers, which default
  // to entityType "dealer" - see utils/partyLedgerFilter - so both sides also require the
  // real "Sundry Debtors"/"Sundry Creditors" account group.
  const [dealerFilter, supplierFilter] = await Promise.all([partyGroupFilter("dealer"), partyGroupFilter("supplier")]);
  const [debtors, creditors] = await Promise.all([
    Ledger.find({ ...dealerFilter, currentBalance: { $gt: 0 } })
      .select("name dealerCode mobile currentBalance creditLimit salesman")
      .populate("salesman", "name")
      .sort({ currentBalance: -1 }),
    Ledger.find({ ...supplierFilter, currentBalance: { $lt: 0 } })
      .select("name dealerCode mobile currentBalance")
      .sort({ currentBalance: 1 }),
  ]);

  res.json({
    debtors: debtors.map((d) => ({
      _id: d._id, name: d.name, dealerCode: d.dealerCode, mobile: d.mobile,
      outstanding: d.currentBalance, creditLimit: d.creditLimit || 0,
      overLimit: !!d.creditLimit && d.currentBalance > d.creditLimit,
      salesman: d.salesman?.name,
    })),
    totalReceivable: Math.round(debtors.reduce((t, d) => t + d.currentBalance, 0) * 100) / 100,
    creditors: creditors.map((s) => ({
      _id: s._id, name: s.name, dealerCode: s.dealerCode, mobile: s.mobile,
      payable: Math.abs(s.currentBalance),
    })),
    totalPayable: Math.round(creditors.reduce((t, s) => t + Math.abs(s.currentBalance), 0) * 100) / 100,
  });
});

// @desc Cash Flow for a period: money in (Receipt vouchers + Cash Sales, which settle
//       straight to Cash/Bank without a separate Voucher - see accountingPostings) vs money
//       out (Payment vouchers), plus current Cash/Bank holdings right now.
// @route GET /api/reports/cash-flow?from=&to=
const getCashFlow = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = {};
  if (from) dateFilter.$gte = new Date(from);
  if (to) dateFilter.$lte = new Date(to);
  const dateMatch = Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {};

  const [[receiptsAgg], [paymentsAgg], [cashSalesAgg], cashLedger, bankLedger] = await Promise.all([
    Voucher.aggregate([
      { $match: { ...dateMatch, voucherType: "receipt" } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    Voucher.aggregate([
      { $match: { ...dateMatch, voucherType: "payment" } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    SalesBill.aggregate([
      { $match: { ...dateMatch, billType: "cash_sale", status: { $ne: "cancelled" } } },
      { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
    ]),
    Ledger.findOne({ name: "Cash Account" }),
    Ledger.findOne({ name: "Bank Account" }),
  ]);

  const moneyIn = (receiptsAgg?.total || 0) + (cashSalesAgg?.total || 0);
  const moneyOut = paymentsAgg?.total || 0;

  res.json({
    moneyIn: Math.round(moneyIn * 100) / 100,
    moneyOut: Math.round(moneyOut * 100) / 100,
    netCashFlow: Math.round((moneyIn - moneyOut) * 100) / 100,
    receiptsCount: receiptsAgg?.count || 0,
    cashSalesCount: cashSalesAgg?.count || 0,
    paymentsCount: paymentsAgg?.count || 0,
    cashBalance: cashLedger?.currentBalance || 0,
    bankBalance: bankLedger?.currentBalance || 0,
  });
});

// @desc HR report: salary register for a given month/year across all employees
// @route GET /api/reports/hr/salary-register?month=&year=
const getSalaryRegister = asyncHandler(async (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) {
    res.status(400);
    throw new Error("month and year are required");
  }
  const slips = await SalarySlip.find({ month: Number(month), year: Number(year) })
    .populate("employee", "name designation");
  res.json(slips);
});

module.exports = {
  getSalesDashboard, getPurchaseDashboard, getSalesReport,
  getGstr1Report, getFinancialStatement, getSalaryRegister, getStockReport,
  getDayBook, getTrialBalance, getCollectionsSummary, getPartyBalances, getCashFlow,
};
