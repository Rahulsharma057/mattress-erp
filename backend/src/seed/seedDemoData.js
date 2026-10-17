// Run once, AFTER seedSuperAdmin.js: node src/seed/seedDemoData.js
// Populates realistic sample data across every module so the app is immediately usable
// for demoing or testing - not just empty screens. Safe to re-run (uses upsert/find-or-create
// wherever practical); business transactions (bills, vouchers, work orders) are only created
// if none exist yet, so re-running won't duplicate them endlessly.
require("dotenv").config();
const connectDB = require("../config/db");

const User = require("../models/User");
const AccountGroup = require("../models/AccountGroup");
const HsnSac = require("../models/HsnSac");
const Ledger = require("../models/Ledger");
const Item = require("../models/Item");
const Department = require("../models/Department");
const Employee = require("../models/Employee");
const Attendance = require("../models/Attendance");
const BillOfMaterial = require("../models/BillOfMaterial");
const Item_ = Item; // alias avoided; kept for clarity in comments below
const WorkOrder = require("../models/WorkOrder");
const StockTransaction = require("../models/StockTransaction");
const SalesBill = require("../models/SalesBill");
const PurchaseBill = require("../models/PurchaseBill");
const Dispatch = require("../models/Dispatch");
const Voucher = require("../models/Voucher");
const RoutePlan = require("../models/RoutePlan");
const Visit = require("../models/Visit");
const ExpenseClaim = require("../models/ExpenseClaim");

const genBillNumber = require("../utils/generateBillNumber");

(async () => {
  await connectDB();
  console.log("Seeding demo data...\n");

  // ---------- 0. Super Admin (in case seedSuperAdmin.js wasn't run) ----------
  let superAdmin = await User.findOne({ email: "admin@sunrisefoam.com" });
  if (!superAdmin) {
    superAdmin = await User.create({ name: "Super Admin", email: "admin@sunrisefoam.com", password: "Admin@123", role: "super_admin" });
    console.log("Created Super Admin login: admin@sunrisefoam.com / Admin@123");
  }

  // ---------- 1. Account Groups ----------
  const groupDefs = [
    { name: "Sundry Debtors", nature: "asset" },
    { name: "Sundry Creditors", nature: "liability" },
    { name: "Cash", nature: "asset" },
    { name: "Bank Accounts", nature: "asset" },
    { name: "Sales Account", nature: "income" },
    { name: "Purchase Account", nature: "expense" },
    { name: "Direct Expenses", nature: "expense" },
    { name: "Indirect Expenses", nature: "expense" },
    { name: "Capital Account", nature: "equity" },
  ];
  const groups = {};
  for (const g of groupDefs) {
    groups[g.name] = await AccountGroup.findOneAndUpdate({ name: g.name }, g, { upsert: true, new: true });
  }
  console.log(`- ${groupDefs.length} Account Groups ready`);

  // ---------- 2. HSN / SAC ----------
  const hsnDefs = [
    { code: "9404", shortName: "Mattresses", sgst: 9, cgst: 9, type: "goods", unit: "PCS" },
    { code: "3921", shortName: "Foam Sheets (Plastic/PU)", sgst: 9, cgst: 9, type: "goods", unit: "PCS" },
    { code: "9404.90", shortName: "Pillows & Cushions", sgst: 9, cgst: 9, type: "goods", unit: "PCS" },
  ];
  const hsns = {};
  for (const h of hsnDefs) {
    let doc = await HsnSac.findOne({ code: h.code });
    if (!doc) doc = await HsnSac.create(h); // create (not upsert) so igst pre-save hook runs
    hsns[h.code] = doc;
  }
  console.log(`- ${hsnDefs.length} HSN/SAC codes ready`);

  // ---------- 3. Ledgers (internal + business) ----------
  const ledgerDefs = [
    { name: "Cash Account", groupName: "Cash" },
    { name: "Staff & Field Expenses", groupName: "Indirect Expenses" },
    { name: "Ramesh Furniture Mart", groupName: "Sundry Debtors", entityType: "dealer", dealerType: "wholesale", mobile: "9876500001", address: "123 GT Road, Industrial Area", city: "Kanpur", pincode: "208001", state: "Uttar Pradesh", country: "India", ledgerType: "registered", gstin: "09AAAAA0000A1Z5", creditLimit: 200000 },
    { name: "Sharma Bedding Store", groupName: "Sundry Debtors", entityType: "dealer", dealerType: "retail", mobile: "9876500002", address: "45 Station Road", city: "Lucknow", pincode: "226001", state: "Uttar Pradesh", country: "India", creditLimit: 100000 },
    { name: "Delhi Foam Traders", groupName: "Sundry Debtors", entityType: "dealer", dealerType: "wholesale", mobile: "9876500003", address: "12 Karol Bagh Market", city: "New Delhi", pincode: "110005", state: "Delhi", country: "India", creditLimit: 150000 },
    { name: "Kumar Foam Suppliers", groupName: "Sundry Creditors", entityType: "supplier", mobile: "9876500004", address: "78 Industrial Estate", city: "Kanpur", pincode: "208012", state: "Uttar Pradesh", country: "India", ledgerType: "registered", gstin: "09BBBBB0000B1Z3", creditLimit: 300000 },
    { name: "National Chemical Industries", groupName: "Sundry Creditors", entityType: "supplier", mobile: "9876500005", address: "5 GIDC Estate", city: "Ahmedabad", pincode: "380015", state: "Gujarat", country: "India", creditLimit: 250000 },
  ];
  const ledgers = {};
  for (const l of ledgerDefs) {
    const doc = await Ledger.findOneAndUpdate(
      { name: l.name },
      { ...l, accountGroup: groups[l.groupName]._id },
      { upsert: true, new: true }
    );
    ledgers[l.name] = doc;
  }
  console.log(`- ${ledgerDefs.length} Ledgers ready (2 internal + 3 dealers + 2 suppliers)`);

  // ---------- 4. Items ----------
  const itemDefs = [
    { name: "Single Bed Mattress 4-inch", unit: "PCS", hsn: "9404", category: "mattress", size: "72x36 inch (Single)", thickness: "4 inch", density: "32 kg/m3", reorderLevel: 10, purchaseRate: 3200, mrp: 6999, rateA: 4500, rateB: 5200 },
    { name: "Double Bed Mattress 5-inch", unit: "PCS", hsn: "9404", category: "mattress", size: "72x60 inch (Double)", thickness: "5 inch", density: "32 kg/m3", reorderLevel: 8, purchaseRate: 5200, mrp: 10999, rateA: 7200, rateB: 8200 },
    { name: "King Size Mattress 6-inch", unit: "PCS", hsn: "9404", category: "mattress", size: "78x72 inch (King)", thickness: "6 inch", density: "40 kg/m3", reorderLevel: 5, purchaseRate: 7800, mrp: 15999, rateA: 10500, rateB: 12000 },
    { name: "PU Foam Sheet 4-inch", unit: "PCS", hsn: "3921", category: "foam_sheet", thickness: "4 inch", density: "32 kg/m3", reorderLevel: 50, purchaseRate: 800 },
    { name: "PU Foam Sheet 6-inch", unit: "PCS", hsn: "3921", category: "foam_sheet", thickness: "6 inch", density: "40 kg/m3", reorderLevel: 30, purchaseRate: 1200 },
    { name: "Sleeping Pillow", unit: "PCS", hsn: "9404.90", category: "pillow", reorderLevel: 20, purchaseRate: 150, mrp: 399, rateA: 250, rateB: 300 },
    { name: "Fabric Cover Roll", unit: "PCS", hsn: "3921", category: "raw_material", reorderLevel: 20, purchaseRate: 300 },
  ];
  const items = {};
  let productCodeSeq = 1;
  for (const it of itemDefs) {
    const existing = await Item.findOne({ name: it.name });
    const productCode = existing?.productCode || `PRD-${new Date().getFullYear()}-${String(productCodeSeq++).padStart(6, "0")}`;
    const doc = await Item.findOneAndUpdate(
      { name: it.name },
      { ...it, hsn: hsns[it.hsn]._id, productCode },
      { upsert: true, new: true }
    );
    items[it.name] = doc;
  }
  console.log(`- ${itemDefs.length} Items ready (mattresses, foam sheets, pillow, raw material)`);

  // ---------- 5. Department + Employees ----------
  const dept = await Department.findOneAndUpdate({ name: "Production" }, { name: "Production" }, { upsert: true, new: true });

  const employeeDefs = [
    { name: "Suresh Kumar", designation: "Machine Operator", doj: new Date("2023-06-01"), basicPay: 16000, phone: "9123400001" },
    { name: "Ramlal Yadav", designation: "Floor Supervisor", doj: new Date("2022-03-15"), basicPay: 22000, phone: "9123400002" },
    { name: "Sunita Devi", designation: "Packing Staff", doj: new Date("2024-01-10"), basicPay: 13500, phone: "9123400003" },
  ];
  const employees = {};
  for (const e of employeeDefs) {
    const doc = await Employee.findOneAndUpdate(
      { name: e.name },
      { ...e, department: dept._id },
      { upsert: true, new: true }
    );
    employees[e.name] = doc;
  }
  console.log(`- 1 Department + ${employeeDefs.length} Employees ready`);

  // ---------- 6. Attendance (last 5 days for each employee) ----------
  let attendanceCount = 0;
  for (const emp of Object.values(employees)) {
    for (let i = 0; i < 5; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const exists = await Attendance.findOne({ employee: emp._id, date });
      if (!exists) {
        await Attendance.create({ employee: emp._id, date, status: i === 2 ? "absent" : "present", markedBy: superAdmin._id });
        attendanceCount++;
      }
    }
  }
  console.log(`- Attendance: ${attendanceCount} new entries (last 5 days x ${employeeDefs.length} employees)`);

  // ---------- 7. BOM: Single Mattress needs 2x Foam Sheet 4-inch + 1x Fabric Cover ----------
  const mattressItem = items["Single Bed Mattress 4-inch"];
  const existingBom = await BillOfMaterial.findOne({ finishedItem: mattressItem._id });
  if (!existingBom) {
    await BillOfMaterial.create({
      finishedItem: mattressItem._id,
      components: [
        { item: items["PU Foam Sheet 4-inch"]._id, quantityRequired: 2 },
        { item: items["Fabric Cover Roll"]._id, quantityRequired: 1 },
      ],
    });
    console.log("- BOM ready: Single Bed Mattress <- 2x Foam Sheet + 1x Fabric Cover");
  } else {
    console.log("- BOM already exists for Single Bed Mattress");
  }

  // ---------- 8. Stock: receive raw materials so production/sales demos actually work ----------
  const stockReceipts = [
    { item: "PU Foam Sheet 4-inch", quantity: 200 },
    { item: "PU Foam Sheet 6-inch", quantity: 100 },
    { item: "Fabric Cover Roll", quantity: 100 },
    { item: "Sleeping Pillow", quantity: 50 },
  ];
  const anyStockYet = await StockTransaction.countDocuments();
  if (anyStockYet === 0) {
    for (const s of stockReceipts) {
      await StockTransaction.create({ type: "receive", item: items[s.item]._id, quantity: s.quantity, remarks: "Opening stock (demo seed)", createdBy: superAdmin._id });
      await Item.findByIdAndUpdate(items[s.item]._id, { $inc: { stockQty: s.quantity } });
    }
    console.log(`- Opening stock received for ${stockReceipts.length} raw material items`);
  } else {
    console.log("- Stock transactions already exist, skipping opening stock");
  }

  // ---------- 9. Work Order: multi-model - 20x Single Mattress + 10x Double Mattress -----
  // Walks the full 6-stage pipeline (planned -> raw material verification -> pasting ->
  // stitching -> packing -> ready to dispatch) so the demo shows a completed real journey.
  const existingWO = await WorkOrder.findOne({ workOrderNumber: "WO-DEMO-0001" });
  if (!existingWO) {
    const doubleMattressItem = items["Double Bed Mattress 5-inch"];
    const wo = await WorkOrder.create({
      workOrderNumber: "WO-DEMO-0001",
      items: [
        { item: mattressItem._id, plannedQty: 20 },
        { item: doubleMattressItem._id, plannedQty: 10 },
      ],
      scheduledDate: new Date(), createdBy: superAdmin._id,
      currentStage: "planned",
      stageHistory: [{ stage: "planned", changedBy: superAdmin._id, changedAt: new Date(), remarks: "Work order created (demo seed)" }],
    });

    const MID_STAGES = ["raw_material_verification", "pasting", "stitching", "packing"];
    for (const stage of MID_STAGES) {
      wo.currentStage = stage;
      wo.stageHistory.push({ stage, changedBy: superAdmin._id, changedAt: new Date(), remarks: "Demo seed progression" });
    }
    await wo.save();

    // Final stage: consume raw materials (only Single Mattress has a BOM in this seed) and
    // credit finished goods for both models.
    await Item.findByIdAndUpdate(items["PU Foam Sheet 4-inch"]._id, { $inc: { stockQty: -40 } }); // 2x per unit x 20
    await Item.findByIdAndUpdate(items["Fabric Cover Roll"]._id, { $inc: { stockQty: -20 } });     // 1x per unit x 20
    await Item.findByIdAndUpdate(mattressItem._id, { $inc: { stockQty: 20 } });
    await Item.findByIdAndUpdate(doubleMattressItem._id, { $inc: { stockQty: 10 } }); // no BOM defined - produced directly
    await StockTransaction.create({ type: "bom_consumption", item: items["PU Foam Sheet 4-inch"]._id, quantity: 40, referenceWorkOrder: wo._id, remarks: "Demo seed consumption", createdBy: superAdmin._id });
    await StockTransaction.create({ type: "bom_consumption", item: items["Fabric Cover Roll"]._id, quantity: 20, referenceWorkOrder: wo._id, remarks: "Demo seed consumption", createdBy: superAdmin._id });
    await StockTransaction.create({ type: "receive", item: mattressItem._id, quantity: 20, referenceWorkOrder: wo._id, remarks: "Demo seed production", createdBy: superAdmin._id });
    await StockTransaction.create({ type: "receive", item: doubleMattressItem._id, quantity: 10, referenceWorkOrder: wo._id, remarks: "Demo seed production", createdBy: superAdmin._id });

    wo.items[0].producedQty = 20;
    wo.items[1].producedQty = 10;
    wo.currentStage = "ready_to_dispatch";
    wo.completedDate = new Date();
    wo.stageHistory.push({ stage: "ready_to_dispatch", changedBy: superAdmin._id, changedAt: new Date(), remarks: "Demo seed - production complete" });
    await wo.save();
    console.log("- Work Order WO-DEMO-0001: 20x Single + 10x Double Mattress, walked through all 6 stages to Ready to Dispatch");
  } else {
    console.log("- Demo work order already exists, skipping");
  }

  // ---------- 10. Salesman user + Sales Bills ----------
  let salesman = await User.findOne({ email: "salesman@sunrisefoam.com" });
  if (!salesman) {
    salesman = await User.create({ name: "Vikram Sales", email: "salesman@sunrisefoam.com", password: "Sales@123", role: "salesman" });
    console.log("Created Salesman login: salesman@sunrisefoam.com / Sales@123");
  }
  ledgers["Ramesh Furniture Mart"].salesman = salesman._id;
  await ledgers["Ramesh Furniture Mart"].save();

  const existingSale = await SalesBill.findOne({ party: ledgers["Ramesh Furniture Mart"]._id });
  if (!existingSale) {
    const billNumber = await genBillNumber(SalesBill, "SB");
    const qty = 5, rate = 4500, sgst = 9, cgst = 9;
    const amount = Math.round(qty * rate * 1.18);
    await SalesBill.create({
      billNumber, billType: "sales_bill", party: ledgers["Ramesh Furniture Mart"]._id, salesman: salesman._id,
      items: [{ item: mattressItem._id, quantity: qty, rate, sgst, cgst, amount }],
      totalAmount: amount, status: "confirmed", createdBy: superAdmin._id,
    });
    await Item.findByIdAndUpdate(mattressItem._id, { $inc: { stockQty: -qty } });
    await StockTransaction.create({ type: "sale_out", item: mattressItem._id, quantity: qty, remarks: `Sold via ${billNumber} (demo seed)`, createdBy: superAdmin._id });
    console.log(`- Sales Bill ${billNumber}: 5x Single Mattress to Ramesh Furniture Mart (₹${amount})`);
  } else {
    console.log("- Demo sales bill already exists, skipping");
  }

  // ---------- 11. Purchase Bill ----------
  const existingPurchase = await PurchaseBill.findOne({ supplier: ledgers["Kumar Foam Suppliers"]._id });
  if (!existingPurchase) {
    const billNumber = await genBillNumber(PurchaseBill, "PB");
    const qty = 100, rate = 150, sgst = 9, cgst = 9;
    const amount = Math.round(qty * rate * 1.18);
    await PurchaseBill.create({
      billNumber, billType: "purchase_bill", supplier: ledgers["Kumar Foam Suppliers"]._id,
      items: [{ item: items["PU Foam Sheet 4-inch"]._id, quantity: qty, rate, sgst, cgst, amount }],
      totalAmount: amount, paymentStatus: "pending", createdBy: superAdmin._id,
    });
    await Item.findByIdAndUpdate(items["PU Foam Sheet 4-inch"]._id, { $inc: { stockQty: qty } });
    await StockTransaction.create({ type: "purchase_in", item: items["PU Foam Sheet 4-inch"]._id, quantity: qty, remarks: `Purchased via ${billNumber} (demo seed)`, createdBy: superAdmin._id });
    console.log(`- Purchase Bill ${billNumber}: 100x Foam Sheet from Kumar Foam Suppliers (₹${amount})`);
  } else {
    console.log("- Demo purchase bill already exists, skipping");
  }

  // ---------- 12. Dispatch ----------
  const saleForDispatch = await SalesBill.findOne({ party: ledgers["Ramesh Furniture Mart"]._id });
  const existingDispatch = await Dispatch.findOne({ salesBill: saleForDispatch?._id });
  if (saleForDispatch && !existingDispatch) {
    const dispatchNumber = await genBillNumber(Dispatch, "DSP", "dispatchNumber");
    await Dispatch.create({
      dispatchNumber, salesBill: saleForDispatch._id, party: ledgers["Ramesh Furniture Mart"]._id,
      packingList: saleForDispatch.items.map((l) => ({ item: l.item, quantity: l.quantity })),
      dispatchType: "party_wise", status: "in_transit", dispatchedBy: superAdmin._id,
    });
    console.log(`- Dispatch ${dispatchNumber} created for the demo sales bill (status: in_transit)`);
  } else {
    console.log("- Demo dispatch already exists or no sales bill to dispatch, skipping");
  }

  // ---------- 13. Voucher: opening collection from a dealer ----------
  const existingVoucher = await Voucher.findOne({ narration: "Opening balance collection (demo seed)" });
  if (!existingVoucher) {
    const voucherNumber = await genBillNumber(Voucher, "RCP", "voucherNumber");
    await Voucher.create({
      voucherType: "receipt", voucherNumber, date: new Date(), ledger: ledgers["Sharma Bedding Store"]._id,
      amount: 15000, drCr: "credit", narration: "Opening balance collection (demo seed)", createdBy: superAdmin._id,
    });
    await Ledger.findByIdAndUpdate(ledgers["Sharma Bedding Store"]._id, { $inc: { currentBalance: -15000 } });
    console.log(`- Voucher ${voucherNumber}: ₹15,000 receipt from Sharma Bedding Store`);
  } else {
    console.log("- Demo voucher already exists, skipping");
  }

  // ---------- 14. Salesman: Route Plan, Visit, Expense Claim (pending approval) ----------
  const existingRoutePlan = await RoutePlan.findOne({ salesman: salesman._id });
  if (!existingRoutePlan) {
    await RoutePlan.create({
      salesman: salesman._id, date: new Date(),
      plannedParties: [ledgers["Ramesh Furniture Mart"]._id, ledgers["Sharma Bedding Store"]._id, ledgers["Delhi Foam Traders"]._id],
    });
    console.log("- Route Plan created for today (3 dealers to visit)");
  }

  const existingVisit = await Visit.findOne({ salesman: salesman._id });
  if (!existingVisit) {
    await Visit.create({
      salesman: salesman._id, party: ledgers["Delhi Foam Traders"]._id,
      collectionAmount: 0, remarks: "Introduced new mattress catalog (demo seed)",
    });
    console.log("- Visit logged for Delhi Foam Traders");
  }

  const existingClaim = await ExpenseClaim.findOne({ salesman: salesman._id });
  if (!existingClaim) {
    await ExpenseClaim.create({
      salesman: salesman._id, date: new Date(), category: "travel", amount: 350,
      remarks: "Bike fuel for dealer visits (demo seed)", status: "pending",
    });
    console.log("- Expense Claim submitted by salesman (₹350 travel, awaiting Admin approval)");
  }

  console.log("\nDemo data seed complete.");
  console.log("Logins: admin@sunrisefoam.com / Admin@123  |  salesman@sunrisefoam.com / Sales@123");
  process.exit(0);
})().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
