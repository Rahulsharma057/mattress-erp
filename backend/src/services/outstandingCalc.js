// Reusable invoice/bill-level settlement calculation - the ONE place that answers "how much
// of this Sales Bill / Purchase Bill has been settled, and what's left". Used by:
//  - Direct Receive Payment / Make Payment (voucherController) and salesman Collection
//    allocation (collectionController) - both validate/clip against this.
//  - Dealer 360 / Aging (receivable and payable).
//
// Source of truth: every Receipt/Payment Voucher's own `allocations` array (see models/
// Voucher.js) - NOT Collection.allocations, which is a display copy only. A Collection's
// allocations get copied onto the Voucher created when it's approved (see collectionController.
// reviewCollection), so from this module's point of view a field-collection receipt and a
// direct accountant-entered receipt look identical: both are just a "receipt" Voucher with
// allocations. This is what stops a source document and its accounting representation from
// ever being counted twice.
//
// Important: allocation is a REPORTING breakdown only. It never changes how much the party
// owes overall - that stays the sum of posted Voucher/SalesBill/PurchaseBill entries on the
// Ledger (see voucherController.applyLedgerDelta). Allocation just answers "which bill(s)
// does this money cover".
const SalesBill = require("../models/SalesBill");
const PurchaseBill = require("../models/PurchaseBill");
const Voucher = require("../models/Voucher");
const Ledger = require("../models/Ledger");

const round2 = (n) => Math.round(n * 100) / 100;

// @desc Every open (not fully-allocated) Sales Bill for a dealer, with how much of it has
//       been allocated by posted Receipt vouchers so far, and what remains outstanding.
//       Only billType "sales_bill" (a true credit sale) counts - a "sale_order" draft has no
//       ledger effect yet, and a "cash_sale" settles straight to Cash/Bank instead of the
//       party (see accountingPostings.postSalesBillAccounting), so neither belongs here.
const getOpenInvoicesForParty = async (partyId) => {
  const [bills, receiptVouchers] = await Promise.all([
    SalesBill.find({ party: partyId, billType: "sales_bill", status: { $in: ["confirmed", "modified"] } }).sort({ date: 1 }),
    Voucher.find({ voucherType: "receipt", ledger: partyId, "allocations.0": { $exists: true } }),
  ]);

  const allocatedByBill = {};
  for (const v of receiptVouchers) {
    for (const a of v.allocations || []) {
      if (!a.salesBill) continue;
      const key = String(a.salesBill);
      allocatedByBill[key] = (allocatedByBill[key] || 0) + (a.amount || 0);
    }
  }

  return bills.map((bill) => {
    const allocatedAmount = allocatedByBill[String(bill._id)] || 0;
    return {
      salesBill: bill._id,
      billNumber: bill.billNumber,
      date: bill.date,
      totalAmount: bill.totalAmount,
      allocatedAmount,
      outstandingAmount: Math.max(0, round2(bill.totalAmount - allocatedAmount)),
    };
  });
};

// @desc Mirror of getOpenInvoicesForParty for the payable side: every open Purchase Bill for
//       a supplier, allocated amount from posted Payment vouchers, and what remains payable.
const getOpenBillsForSupplier = async (supplierId) => {
  const [bills, paymentVouchers] = await Promise.all([
    PurchaseBill.find({ supplier: supplierId, billType: "purchase_bill", status: { $ne: "cancelled" } }).sort({ date: 1 }),
    Voucher.find({ voucherType: "payment", ledger: supplierId, "allocations.0": { $exists: true } }),
  ]);

  const allocatedByBill = {};
  for (const v of paymentVouchers) {
    for (const a of v.allocations || []) {
      if (!a.purchaseBill) continue;
      const key = String(a.purchaseBill);
      allocatedByBill[key] = (allocatedByBill[key] || 0) + (a.amount || 0);
    }
  }

  return bills.map((bill) => {
    const allocatedAmount = allocatedByBill[String(bill._id)] || 0;
    return {
      purchaseBill: bill._id,
      billNumber: bill.billNumber,
      date: bill.date,
      totalAmount: bill.totalAmount,
      allocatedAmount,
      outstandingAmount: Math.max(0, round2(bill.totalAmount - allocatedAmount)),
    };
  });
};

// Generic allocation validator, shared by the receivable and payable side. `openBills` is
// whatever getOpenInvoicesForParty/getOpenBillsForSupplier returned; `billKey` is which
// field on each allocation line names the bill ("salesBill" or "purchaseBill").
const validateAllocationsAgainst = (openBills, billKey, amount, allocations) => {
  if (!allocations || allocations.length === 0) return;

  const sum = allocations.reduce((t, a) => t + (a.amount || 0), 0);
  if (sum > amount + 0.01) {
    throw new Error(`Allocated total (${sum}) cannot exceed the amount (${amount})`);
  }

  const byBill = Object.fromEntries(openBills.map((i) => [String(i[billKey]), i]));
  for (const a of allocations) {
    const bill = byBill[String(a[billKey])];
    if (!bill) throw new Error("One of the selected bills does not belong to this party");
    if (a.amount > bill.outstandingAmount + 0.01) {
      throw new Error(`Cannot allocate ₹${a.amount} to ${bill.billNumber}: only ₹${bill.outstandingAmount} is outstanding on it`);
    }
  }
};

const validateAllocations = async (partyId, amount, allocations) =>
  validateAllocationsAgainst(await getOpenInvoicesForParty(partyId), "salesBill", amount, allocations);

const validatePurchaseAllocations = async (supplierId, amount, allocations) =>
  validateAllocationsAgainst(await getOpenBillsForSupplier(supplierId), "purchaseBill", amount, allocations);

// Generic clip, shared by both sides - see clipAllocationsToCurrentOutstanding below.
const clipAllocationsAgainst = (openBills, billKey, allocations) => {
  if (!allocations || allocations.length === 0) return [];

  const remainingByBill = Object.fromEntries(openBills.map((i) => [String(i[billKey]), i.outstandingAmount]));
  const clipped = [];
  for (const a of allocations) {
    const key = String(a[billKey]);
    const available = remainingByBill[key] || 0;
    const clippedAmount = Math.min(a.amount, available);
    if (clippedAmount > 0) {
      clipped.push({ [billKey]: a[billKey], amount: clippedAmount });
      remainingByBill[key] = available - clippedAmount;
    }
  }
  return clipped;
};

// Clips a proposed allocation against what is CURRENTLY outstanding (called right before
// posting, since time may have passed since the allocation was chosen and another
// receipt/payment may have already been posted against the same bill in the meantime).
// Never blocks posting - any amount that no longer fits its bill quietly falls back to
// unallocated/on-account, because the ledger posting itself is unaffected by allocation either way.
const clipAllocationsToCurrentOutstanding = async (partyId, allocations) =>
  clipAllocationsAgainst(await getOpenInvoicesForParty(partyId), "salesBill", allocations);

const clipPurchaseAllocationsToCurrentOutstanding = async (supplierId, allocations) =>
  clipAllocationsAgainst(await getOpenBillsForSupplier(supplierId), "purchaseBill", allocations);

const AGING_BUCKETS = ["Not Due", "0-30", "31-60", "61-90", "91-180", "180+"];

const bucketForDaysOverdue = (days) => {
  if (days <= 0) return "Not Due";
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  if (days <= 180) return "91-180";
  return "180+";
};

// Shared by both aging functions below - buckets a list of {date, totalAmount, allocatedAmount,
// outstandingAmount, billNumber, ...idKey} rows by days-overdue-from-due-date.
const buildAging = (openBills, idKey, paymentTermsDays, asOf) => {
  const invoices = openBills
    .filter((b) => b.outstandingAmount > 0)
    .map((b) => {
      const dueDate = new Date(b.date);
      dueDate.setDate(dueDate.getDate() + paymentTermsDays);
      const daysOverdue = Math.floor((asOf - dueDate) / (1000 * 60 * 60 * 24));
      return {
        [idKey]: b[idKey],
        billNumber: b.billNumber,
        date: b.date,
        dueDate,
        amount: b.totalAmount,
        received: b.allocatedAmount,
        outstandingAmount: b.outstandingAmount,
        daysOverdue,
        bucket: bucketForDaysOverdue(daysOverdue),
      };
    });

  const buckets = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0]));
  for (const inv of invoices) buckets[inv.bucket] += inv.outstandingAmount;
  const overdueAmount = AGING_BUCKETS.filter((b) => b !== "Not Due").reduce((t, b) => t + buckets[b], 0);

  return { asOf, paymentTermsDays, buckets, overdueAmount, invoices };
};

// @desc Invoice-wise receivables aging for a dealer/customer. Due date = invoice date + the
//       dealer's paymentTermsDays (0 if not set, i.e. due on the invoice date itself).
const getAgingForParty = async (partyId, asOf = new Date()) => {
  const ledger = await Ledger.findById(partyId);
  const openInvoices = await getOpenInvoicesForParty(partyId);
  return buildAging(openInvoices, "salesBill", ledger?.paymentTermsDays || 0, asOf);
};

// @desc Mirror of getAgingForParty for payables - bill-wise aging of what we owe a supplier.
const getPayableAgingForSupplier = async (supplierId, asOf = new Date()) => {
  const ledger = await Ledger.findById(supplierId);
  const openBills = await getOpenBillsForSupplier(supplierId);
  return buildAging(openBills, "purchaseBill", ledger?.paymentTermsDays || 0, asOf);
};

module.exports = {
  getOpenInvoicesForParty, validateAllocations, clipAllocationsToCurrentOutstanding, getAgingForParty,
  getOpenBillsForSupplier, validatePurchaseAllocations, clipPurchaseAllocationsToCurrentOutstanding, getPayableAgingForSupplier,
};
