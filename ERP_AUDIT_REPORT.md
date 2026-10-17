# ERP Audit Report — Phase 1

Status key: ✅ Verified working (tested against the live Atlas DB) · 🔧 Fixed this session (verified) · ⚠️ Works, but a business rule needs your confirmation · ❌ Known gap, not implemented

## 1. Salesman & Collections

- ✅ `Visit` → optional `Collection` (status `pending_approval`) → Admin/Accountant approval → exactly one Receipt voucher posted, dealer outstanding drops. No duplicate posting (status-guarded).
  - `backend/src/controllers/visitController.js`, `backend/src/controllers/collectionController.js::reviewCollection`
- 🔧 Fixed: a salesman could log a visit/collection against ANY dealer, not just their own. Now blocked server-side (403) + frontend "Party Visited" list scoped to `myDealers`.
  - `backend/src/controllers/visitController.js:9-25`
- ⚠️ Collected cash is posted straight into "Cash Account"/"Bank Account" on approval (via `paymentModeLedgers.js`), not into a separate salesman-custody/handover account. **Question 1 below.**
- ❌ No "handover" step (salesman → accountant physically handing over cash) is tracked — approval alone is treated as the handover.

## 2. Vouchers & Accounting

- ✅ Every voucher is real double-entry (`ledger`/`counterLedger`, `drCr`), not single-sided. Receipt/Payment/Journal/Contra/Credit-Debit-Note all supported.
  - `backend/src/models/Voucher.js`, `backend/src/controllers/voucherController.js`
- 🔧 Fixed: Voucher List (Accounts page) appeared to "disappear" — root cause was `Promise.all` in several pages' `loadData()`: one slow/failed request silently discarded data that DID load. Replaced with `Promise.allSettled` on Sales/Purchase/Accounts/Salesman/Production pages.
- 🔧 Added: `source` field on every voucher (manual / direct_receipt / direct_payment / collection_approval / expense_approval / credit_note / debit_note) + displayed as a column, so it's visible whether a voucher was typed manually or auto-posted.
- 🔧 Added: explicit "Received In"/"Paid From" account selector (required) on Receive Payment / Make Payment — previously silently defaulted to one hardcoded "Bank Account" ledger regardless of how many bank accounts exist. Payment Mode and the settlement account are now separate fields.
  - `backend/src/controllers/voucherController.js::receivePayment/makePayment`
- 🔧 Added: Receipt/Payment voucher PDF (print/download), generated on demand, never stored — `GET /api/accounts/:id/receipt`.
- ⚠️ Duplicate-submission protection is **client-side only** (disabled button while saving) — there is no server-side idempotency key, so a retried network request from a flaky connection could theoretically double-post. Not observed as a real bug, flagging as a gap.

## 3. Sales

- ✅ Sales Bill / Cash Sale / Sale Order, credit-limit check with authorized override, stock integrity check before posting.
  - `backend/src/controllers/salesBillController.js`
- 🔧 Fixed (severe): GST was being computed as `sgst + cgst + igst` summed together everywhere (frontend previews and `computeLineAmounts`), when `igst = sgst + cgst` by design (alternatives for the same rate) — doubling the effective tax rate on every bill. Fixed via `utils/gstSplit.js` + `COMPANY_STATE` env var.
- 🔧 Fixed: a Sales Bill can now only sell from a selected **existing ItemVariant that actually has stock** — overselling is blocked at the exact size level, not the item's combined total (see Item Master/Inventory below).
- ⚠️ Stock decreases **at Sales Bill posting**, not at Dispatch. **Question 2 below.**

## 4. Purchase

- ✅ Purchase Bill / Purchase Order, stock increase on confirm, Dr Purchase Account + Dr Input GST, Cr Supplier.
  - `backend/src/controllers/purchaseBillController.js`
- 🔧 Fixed: a Purchase line can select an existing specification OR register a new one (optional length/width/thickness/density) — resolved/created via `ItemVariant`. Fixed a bug where an explicitly-picked existing variant was being silently re-derived from (blank) dimensions.
- 🔧 Added: "Paid From" account selector (required) on Make Payment, same as Sales.
- ⚠️ "Received In"/credit-terms/advance-payment policy: partial/advance payments ARE supported (allocation against specific bills, unallocated falls to on-account) — confirmed this is intentional design, not a bug.

## 5. Work Order & Production

- ✅ Multi-model Work Order with a real stage pipeline (`planned → raw_material_verification → pasting → stitching → packing → ready_to_dispatch`), full stage history, BOM-driven raw-material consumption.
  - `backend/src/models/WorkOrder.js`, `backend/src/controllers/workOrderController.js`
- ✅ Finished-goods stock increases **only** on the `ready_to_dispatch` transition (not on Work Order creation) — confirmed by reading `advanceStage`, no stock write anywhere else. Re-running `advanceStage` on an already-`ready_to_dispatch` order is rejected (`"already at the final stage"`), so no duplicate credit on repeat clicks.
- 🔧 Fixed: finished-goods credit now goes to the exact size/spec variant produced (via `ItemVariant`), not a single merged total for the item — each Work Order line can carry its own length/width/thickness/density.
- 🔧 Fixed: Work Order table appeared to "not show" — same `Promise.all`→`allSettled` root cause as #2.

## 6. Ledger & Accounts

- ✅ Ledger Transactions / Statement / Dealer 360 / Aging work for any ledger (dealer, supplier, or now individual).
- 🔧 Fixed (severe): internal nominal ledgers (Cash Account, Bank Account, Sales Account, GST ledgers...) default to `entityType: "dealer"` in the schema (never explicitly set by the seed scripts) — this leaked them into Sales/Purchase party dropdowns and into the Debtors total / Dashboard outstanding figure. Fixed with `utils/partyLedgerFilter.js`, which also requires the ledger's actual account-group membership ("Sundry Debtors"/"Sundry Creditors"), not `entityType` alone.
- 🔧 Added just now: a third `entityType`, **"individual"** — a standalone personal/self account (employee advance, petty-cash custodian) that needs only a Name + Account Group, none of the Dealer/Supplier-only required fields (mobile, dispatch address, credit limit). Validated conditionally on the backend; UI shows/hides fields accordingly; added an inline "+ New Account Group" quick-create in the Ledger form.
- ⚠️ No user ↔ ledger auto-creation exists anywhere (confirmed: `User` model has no ledger reference, no controller creates a Ledger on signup) — so "do not auto-create a ledger per login user" is already true, not a risk.
- ❌ Bank/Cash reconciliation against a real bank statement (matching external bank CSV/statement lines) is not implemented — only internal posting consistency (Dr=Cr) is guaranteed.

## 7. Account Groups

- ✅ Fully free-form: any user with admin/super_admin role can create a custom group (name + nature: asset/liability/income/expense/equity) — `backend/src/controllers/accountGroupController.js`. Nothing restricts this to a fixed list.

## 8. HSN/SAC & Tax

- 🔧 Fixed (severe, see #3) — GST doubling bug, now resolved and numerically verified (₹11,800 correct vs ₹13,600 before, on a ₹10,000 line at 9/9/18%).
- ✅ `igst = sgst + cgst` enforced via a pre-save hook on `HsnSac` — confirmed intentional, not a bug.
- ⚠️ `COMPANY_STATE` env var must be set correctly for the CGST+SGST vs IGST split to resolve correctly — currently left blank intentionally (never guessed). **Needs your input to set it correctly once, in `backend/.env`.**

## 9. Dispatch

- ✅ Dispatch is a logistics/packing-list tracker against an **already-posted** Sales Bill — partial dispatch supported, capped at remaining undispatched qty per line, no double-dispatch possible.
  - `backend/src/controllers/dispatchController.js`
- ⚠️ **Confirmed by reading the code, not assumed:** marking a Dispatch "returned" does **NOT** reverse stock or the dealer's ledger — it only frees that quantity to be dispatched again. A real sales return must go through the separate Credit Note flow. This is explicit in the code's own comments, but is this the business rule you actually want? **Question 2 below is about this.**
- ❌ `Dispatch.packingList` has no `variant` field — it records quantity per Item only, not per specific size/spec, even though Sales now tracks exact variants. This means a dispatch note can't show WHICH size was packed when an item has multiple sizes outstanding on the same bill.

## 10. Item Master & Inventory

- 🔧 Major addition this session: a full **Item → ItemVariant (size/spec) → stock** architecture.
  - New model `backend/src/models/ItemVariant.js` — one row per exact (item, length, width, thickness, density), unique-indexed so the same spec always resolves to the same row.
  - `backend/src/services/itemVariants.js` — `getOrCreateVariant` (idempotent) and `applyVariantStockDelta` (updates the variant AND keeps `Item.stockQty` as a rollup total, so existing reports keep working).
  - Verified live: repeat-purchasing the same spec accumulates on one row; a different spec creates a separate row; selling one size cannot touch another size's stock even when the item's combined total looks sufficient; cancellation reverses stock to the correct variant.
- 🔧 Item Master's Size/Thickness/Density inputs removed from the **create** flow (specs are now entered at Work Order/Purchase time) — existing item data on old records is preserved and shown read-only, never deleted.
- 🔧 Added: Item Master "View" action → size-wise stock table (Total Received / Issued / Available per spec), `GET /api/masters/items/:id/variants`.
- ⚠️ Opening stock entry: there is a generic "Stock Receive" manual transaction (`stockController.createStockTransaction`), but it is **NOT variant-aware** — it only bumps `Item.stockQty` directly, bypassing the variant system entirely. If you need to set an OPENING stock for a specific size, there is currently no UI/API for that. **Question 3 below.**

## 11. Reports

- 🔧 Added this session: Day Book, Trial Balance, Debtors/Creditors list, Cash Flow — all built from actual posted Voucher/SalesBill/PurchaseBill records, no hardcoded totals.
- 🔧 Fixed: Dashboard "Total Outstanding" and GSTR-1/Financial Statement were summing in internal ledgers (see #6) before the `partyLedgerFilter` fix.
- ❌ Reports are not yet variant-aware (e.g., GSTR-1/Sales Register show item-level totals, not size-wise breakdowns). Flagging as a gap, not fixing without confirmation it's wanted.

---

## Open Business-Rule Questions (Batch 1 of however many are needed)

**Q1. Salesman collection ka paisa kaha jaata hai, approval ke baad?**
Abhi jab admin ek salesman ki collection approve karta hai, paisa seedha "Cash Account" ya "Bank Account" mein chala jaata hai (jaise office mein hi aa gaya). Kya aapko ek **alag "Salesman custody" account** chahiye — matlab collection approve hone par pehle salesman ke naam ek ledger mein paisa jaaye, aur jab salesman physically cash accountant ko de (handover), tab doosra voucher post ho jo Salesman ledger se Cash Account mein transfer kare? Ya current single-step flow (approval = paisa seedha company cash mein) hi sahi hai?

**Q2. Dispatch "returned" hone par stock/ledger wapas hona chahiye?**
Abhi Dispatch module mein "returned" status sirf itna karta hai ki wo quantity dobara dispatch ke liye free ho jaati hai — stock ya dealer ka balance kuch nahi badalta (stock pehle hi Sales Bill banate waqt kat gaya tha, dispatch ke time nahi). Ek real sales return ke liye alag se Credit Note banana padta hai. Kya yahi sahi hai, ya aap chahte hain ki "Dispatch returned" khud hi stock wapas jod de aur dealer ka balance bhi adjust kare (bina alag Credit Note banaye)?

**Q3. Opening stock size-wise kaise enter hoga?**
Naya "ItemVariant" (size-wise stock) system ban gaya hai, lekin manual "Stock Receive" abhi bhi sirf Item-level hai (size ka pata nahi chalta). Agar kisi existing size ka **opening balance** set karna ho (jaise business shuru karte waqt already-maujooda stock), uske liye koi UI nahi hai abhi. Kya yeh chahiye - ek "Opening Stock" entry jisme Item + Size/Spec + Quantity select karke stock set kiya ja sake?

**Q4. `COMPANY_STATE` kya set karna hai?**
GST sahi se CGST+SGST vs IGST split karne ke liye `backend/.env` mein `COMPANY_STATE` set hona zaroori hai (abhi khaali hai, maine guess nahi kiya). Aapki company kis state mein registered hai (jaise "Uttar Pradesh", "Delhi" etc.)?
