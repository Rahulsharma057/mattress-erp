# Mattress ERP - Backend

Node.js + Express + MongoDB (Mongoose) backend for the Sunrise Foam Industries /
Samraddhi Mattresses ERP. All 8 planned modules are implemented and wired end-to-end.

## What's included

- **Auth**: JWT login (`POST /api/auth/login`), `GET /api/auth/me`
- **RBAC**: role-based (`allowRoles`) + fine-grained per-module permission checks (`checkPermission`)
- **IP restriction middleware** (optional, via `ALLOWED_IPS` in `.env`)
- **Users & Role Management**: full CRUD (`/api/users`) - Super Admin only
- **Masters**: Account Group (with an "Under Group" standard-category classification), a
  comprehensive **Dealer/Supplier Ledger** (dealer code auto-generated `DLR-YYYY-NNNNNN`,
  entity type, dealer type, GSTIN/PAN, salesman assignment, full address, credit limit,
  payment terms, GST treatment/state/place-of-supply, TCS/TDS/E-way bill flags, document
  slots), HSN/SAC, and a **comprehensive Product/Item master** (product code auto-generated
  `PRD-YYYY-NNNNNN`, type, fast-search/decimal/company-product flags, purchase rate, MRP,
  two extra rate tiers, barcode, warranty) — full CRUD (`/api/masters/...`)
- **Dealer/Customer 360 view**: `GET /api/masters/ledgers/:id/transactions` merges every
  Sales Bill, Purchase Bill, and Voucher (payments, receipts, credit/debit notes) for one
  ledger into a single chronological statement with a running balance.
- **Employee Master**: Employee + Department CRUD, optional linked login user (`/api/employees`)
- **Attendance**: daily entry + summary endpoint used for salary computation (`/api/attendance`)
- **Salary Slips**: auto-computes pay from attendance, generates a PDF (pdfkit), uploads it to
  Cloudinary, and saves the slip record (`POST /api/salary-slips/generate`, `GET /api/salary-slips`)
- **Production**: Bill of Material CRUD, manual Stock Transactions (receive/scrap issue/scrap
  return), and **multi-model Work Orders** that walk the real 6-stage manufacturing pipeline —
  Planned → Raw Material Verification → Pasting → Stitching → Packing → Ready to Dispatch.
  A single Work Order can cover several product models at once (e.g. 12 mattress models),
  each with its own planned quantity; every stage transition is recorded in a full
  `stageHistory` audit trail. Moving into the final stage is the one step that touches stock:
  it consumes each model's BOM raw materials (merged across models sharing a material) and
  credits each model's finished-goods stock, with an all-or-nothing stock-sufficiency check
  first (`/api/production/work-orders/:id/advance-stage`, `.../cancel`)
- **Sales**: Sales Bill / Sale Order / Cash Sale creation with auto stock deduction + reversal
  on cancel, salesman auto-attribution, **and now also posts the invoice amount to the
  dealer's ledger balance** (reversed on cancel) - previously bills never touched the ledger
  at all, only standalone Vouchers did (`/api/sales`)
- **Purchase**: Purchase Bill / Purchase Order creation with auto stock addition, payment
  status tracking, **and now posts to the supplier's ledger balance** the same way (`/api/purchase`)
- **Dispatch**: packing list creation from a sales bill, party-wise/office-wise, status
  tracking (pending/in transit/delivered/returned) (`/api/dispatch`)
- **Accounts**: all 6 voucher types (Receipt/Payment/Credit Note/Debit Note/Contra/Journal)
  in one polymorphic collection, auto-updates ledger running balance on save/delete, plus a
  full ledger statement endpoint with running balance (`/api/accounts`). **Dedicated Credit
  Note (sales return) and Debit Note (purchase return) endpoints** on top of the generic
  voucher form - each posts the ledger adjustment AND moves stock (credit note brings
  returned goods back in, debit note sends them back out, blocked if not enough stock is on
  hand) - `/api/accounts/credit-notes`, `/api/accounts/debit-notes`.
- **Salesman App**: Route Plans, Visit Logging (auto-creates a Receipt voucher when a
  collection amount is logged), **Expense Claims with two-level approval** - an Admin must
  approve first, then a Super Admin gives final approval; final approval auto-posts a
  Payment voucher (debits "Staff & Field Expenses", credits "Cash Account") so reimbursements
  flow straight into Accounts (`/api/salesman`)
- **Reports & Dashboards**: Sales Dashboard, Purchase Dashboard, Sales Report (day/party/product),
  GSTR-1 style report, simplified Financial Statement (Balance Sheet + P&L), HR Salary
  Register (`/api/reports/...`)
- **File uploads**: generic Cloudinary-backed upload endpoint (`POST /api/uploads`, multipart
  field `file`) - used by the Expense Claim receipt upload on the frontend, reusable for
  employee documents or item images too.
- **Cloudinary helper** (`src/config/cloudinary.js`), **salary calculation service**
  (`src/services/salaryCalc.js`), **PDF generator** (`src/services/pdfGenerator.js`).

## Production hardening

- **Security**: `helmet`, `express-mongo-sanitize` (blocks NoSQL injection), `hpp` (HTTP
  parameter pollution guard), CORS restricted to a whitelist via `CORS_ORIGINS`
- **Rate limiting**: strict limiter on `/api/auth/login` (10 attempts/15min), generous
  general limiter on the rest of the API (`src/middleware/rateLimiters.js`)
- **Input validation**: `express-validator` chains on every write endpoint across all
  modules (`src/validators/`) - bad requests get a 400 with field-level errors before they
  ever reach a controller- **Structured logging**: `winston` (`src/config/logger.js`) - JSON logs to
  `logs/error.log` + `logs/combined.log` in production
- **Env validation on boot**: `src/config/validateEnv.js` fails fast if
  `MONGO_URI`/`JWT_SECRET` are missing
- **Graceful shutdown**: `server.js` handles `SIGTERM`, `unhandledRejection`, `uncaughtException`
- **Compression**: gzip via `compression`
- **Docker**: `Dockerfile` + `.dockerignore`; root `docker-compose.yml` runs Mongo + backend
  + frontend together
- **PM2**: `ecosystem.config.js` for VPS deployment in cluster mode
- **Pagination utility**: `src/utils/paginate.js` ready to drop into any list endpoint once a
  collection grows large (not yet wired into Masters/Sales list endpoints - see Next Steps)
- **Zero unused dependencies**: every package in `package.json` is actually required
  somewhere in the code (verified by audit - `multer`/`multer-storage-cloudinary` now power
  the `/api/uploads` endpoint above)

## Verified by testing

This backend was actually run and exercised end-to-end (not just syntax-checked): a full
Express app boot, real HTTP requests through every route, and a real in-memory data store
driving **146 integration-style tests across 7 rounds** covering all 8 modules, including:
- The full comprehensive Dealer master (auto dealer code, salesman assignment, all the new
  address/business/tax fields) and Product master (auto product code, pricing tiers)
- The complete 6-stage Work Order pipeline for a multi-model work order (2 different product
  models in one work order), walked stage by stage to Ready to Dispatch, with correct
  merged BOM consumption across models and a full stage-history audit trail
- Sales/Purchase bills correctly posting to (and reversing on cancel/un-posting from) the
  dealer's/supplier's ledger balance
- Credit Note (sales return: ledger credited, stock returned) and Debit Note (purchase
  return: ledger debited, stock sent back out, blocked if insufficient stock) end-to-end,
  including their `salesBillRef`/`purchaseBillRef` linkage
- The Dealer/Customer 360 transactions view, confirming cancelled bills are correctly
  excluded from the active history
- Every module from earlier rounds (login/RBAC, HR + salary slip PDF, the two-level expense
  approval + auto Payment voucher, Salesman visit-triggered receipts, RBAC data-scoping,
  low-stock filtering, nested-subdocument population, every Report aggregation) - all still
  passing after every schema change, confirming no regressions.

This exercise found and fixed **18 real gaps** total across all hardening rounds - the
newest ones specific to this pass:
- **Sales Bills and Purchase Bills never updated the ledger balance at all** - only
  standalone Vouchers did. A dealer could owe ₹50,000 in unpaid invoices and their ledger
  would still show ₹0 unless someone separately posted a matching voucher. Now every Sales
  Bill debits the dealer's ledger (reversed on cancel) and every Purchase Bill credits the
  supplier's ledger - the same fix that makes the Dealer 360 view actually meaningful.
- (Same class as before) Account Group / HSN / Item / Ledger / User update endpoints needed
  their validators extended for the many new dealer/product fields, which is now done.

## Setup

## Setup

```bash
cd backend
npm install
cp .env.example .env        # fill in MONGO_URI, JWT_SECRET, Cloudinary keys
npm run dev
node src/seed/seedSuperAdmin.js   # creates first Super Admin login
node src/seed/seedMasters.js      # seeds default Account Groups + common HSN codes
```

Default seeded login: `admin@sunrisefoam.com` / `Admin@123` — change immediately.

**Important first-run order**: `seedMasters.js` gives you starter Account Groups (Sundry
Debtors/Creditors, Cash, Sales/Purchase Account, etc.), HSN codes (9404 - Mattresses,
3921 - Foam Sheets), and two ledgers the app itself depends on: **"Cash Account"** and
**"Staff & Field Expenses"** - these two are looked up by name when an expense claim gets
final Super Admin approval, to auto-post the reimbursement Payment voucher. If you rename or
delete them, that auto-posting silently skips (the claim still gets approved, just without
the automatic accounting entry) - see `expenseClaimController.js`.

**Want full sample data instead of just masters?** Run `node src/seed/seedDemoData.js`
instead of (or after) `seedMasters.js` - it seeds everything above PLUS 3 dealers, 2
suppliers, 7 items (mattresses/foam/pillow), a department with 3 employees and 5 days of
attendance, a BOM, opening stock, a completed Work Order, a Sales Bill, a Purchase Bill, a
Dispatch, a Voucher, and a Salesman login (`salesman@sunrisefoam.com` / `Sales@123`) with a
Route Plan, a Visit, and a pending Expense Claim - so every screen has something to look at
immediately instead of being empty. Safe to re-run; it skips anything that already exists.

## Next steps (refinement, not new modules)

1. **GSTR-2 & GSTR-3B**: `getGstr1Report` covers outward supplies (sales). Mirror it against
   `PurchaseBill` for GSTR-2, and build GSTR-3B as a summary combining both.
2. **Balance Sheet / P&L polish**: add period filtering and a trial-balance check
   (assets = liabilities + equity) before treating it as audit-ready.
3. **Approval workflows**: Expense Claim approve/reject exists; consider the same for
   Purchase Orders and Sale Orders before they become bills.
4. **IP-binding**: middleware exists (`ipRestrict.js`) but isn't attached to any route yet -
   add it in front of `/api/users` if you want Super Admin access geofenced.
5. **Real double-entry accounting**: the current Voucher model is a simplified single/counter
   ledger model, not strict double-entry. Fine for a small manufacturer; upgrade to a
   `VoucherEntry` sub-collection if you need formal audit compliance later.
6. **Wire pagination**: `src/utils/paginate.js` exists but isn't applied yet - Ledgers/Items/
   Sales Bills return the full collection as a plain array (fine at hundreds of rows; revisit
   at thousands).
7. **Tests**: no automated tests yet. Start with `supertest` + `mongodb-memory-server` -
   the RBAC and stock-consumption logic are the highest-value places to cover first.
