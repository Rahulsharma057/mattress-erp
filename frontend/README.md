# Mattress ERP - Frontend

Next.js (App Router) + MUI frontend for the Sunrise Foam Industries / Samraddhi
Mattresses ERP. Every backend module has a working, wired screen with full CRUD where the
data is master data (create/edit/delete), and create + status-transitions where the data is
a transactional record (matching real ERP/accounting practice - see note below).

## What's included

- JWT auth flow: polished `/login` page, Zustand `authStore`, axios interceptor (`lib/api.ts`)
  that attaches the token, auto-redirects to `/login` on 401, and shows every API error as a
  toast (via `components/SnackbarProvider.tsx`) - nothing fails silently. Successful
  create/update/delete actions also show a success toast.
- Icon-based, sectioned sidebar (`components/Sidebar.tsx` + `lib/roleConfig.ts`) grouped into
  Masters / HR / Production / Transactions / Field Sales / Insights / Admin - every entry maps
  to a real page; add new modules by adding one entry to `NAV_ITEMS`.
- Reusable `components/ConfirmDialog.tsx` - every delete action asks for confirmation first.
- `AuthGuard` wrapping every `(dashboard)` route.
- **16 working screens**, all wired to their backend endpoint:

| Screen | Route | CRUD |
|---|---|---|
| Dashboard (icon stat cards, live sales chart, dispatch chips) | `/` | read-only |
| Account Group Master (with "Under Group" standard category) | `/masters/account-group` | Create, Edit, Delete |
| **Dealer/Ledger Master** (full onboarding form: entity/dealer type, GSTIN/PAN, salesman assignment, address, credit limit, GST/TCS/TDS/e-way details, tabbed sections) + **Statement view** (combined Sales/Purchase/Voucher history) | `/masters/ledger` | Create, Edit, Delete |
| HSN/SAC Master | `/masters/hsn` | Create, Edit, Delete |
| **Product/Item Master** (product code, type, pricing tiers - P.Rate/MRP/Rate A/Rate B, barcode, warranty, tabbed sections) | `/masters/item` | Create, Edit, Delete |
| Employee Master (+ Departments, inline manage) | `/hr/employees` | Create, Edit, Delete |
| Attendance | `/hr/attendance` | Create (daily entry) |
| Salary Slips (generate + download PDF) | `/hr/salary-slips` | Create |
| **Production / Work Orders** (multi-model line items, 6-stage pipeline stepper: Planned → Raw Material Verification → Pasting → Stitching → Packing → Ready to Dispatch, full record/stage-history view) | `/production` | Create, Advance stage, Cancel |
| Sales | `/sales` | Create, Cancel |
| Purchase | `/purchase` | Create, update payment status |
| Dispatch | `/dispatch` | Create, update status |
| Accounts / Vouchers + **Credit/Debit Notes** (sales/purchase returns, adjusts both ledger and stock) | `/accounts` | Create, **Delete** (reverses ledger balance) |
| Salesman App (Visits + Expense Claims w/ receipt upload) | `/salesman` | Create |
| Expense Approvals (2-stage: Admin then Super Admin, stepper UI) | `/expense-approvals` | Approve/Reject |
| Reports (GSTR-1, Financial Statement, Purchase Dashboard) | `/reports` | read-only |
| **Users & Role Management** | `/users` | Create, Edit, Delete (Super Admin only) |

**Why transactional records (Sales/Purchase/Dispatch/Attendance/Work Orders) don't have raw
edit/delete**: this matches real accounting/ERP practice - a posted bill or voucher should be
corrected by *reversing* it (Cancel, or delete-and-reverse for Vouchers), not silently edited
in place, so there's always an audit trail of what actually happened. Masters (Ledger, Item,
Account Group, HSN, Employee, Users) are configuration data, not a transaction history, so
those get full edit/delete.

## Setup

```bash
cd frontend
npm install
cp .env.local.example .env.local   # point NEXT_PUBLIC_API_BASE_URL at your backend
npm run dev
```

**First-run order matters**: create an Account Group and an HSN/SAC code before trying to
create a Ledger or Item (their dropdowns pull from those masters) - or just run the
backend's `seedMasters.js` (starter masters only) or `seedDemoData.js` (full sample data
across every module - dealers, items, employees, a completed work order, bills, vouchers,
the works) so every screen already has something to show.

Make sure the backend is running and you've seeded a Super Admin + demo data
(`node src/seed/seedSuperAdmin.js` then `node src/seed/seedDemoData.js` in `backend/`), then
log in at `/login` (`admin@sunrisefoam.com` / `Admin@123`, or the demo salesman login
`salesman@sunrisefoam.com` / `Sales@123` to see the Salesman App from that side).

## Production build

`next.config.js` sets `output: "standalone"` so `npm run build` produces a minimal
self-contained server (`.next/standalone`) - the `Dockerfile` here uses that output for a
lean image instead of shipping the full `node_modules`.

## Remaining polish (optional)

1. **Route Plan UI**: `POST /api/salesman/route-plans` exists but has no screen yet - add a
   "plan tomorrow's visits" form next to the Salesman App tabs.
2. **Geolocation on Visit Logging**: the `Visit` model has a `location {lat, lng}` field -
   wire `navigator.geolocation.getCurrentPosition()` into the visit form for real field use.
3. **BOM edit/delete UI**: the backend supports it (`PUT`/`DELETE /api/production/bom/:id`)
   but the Production screen only lets you create a BOM, not edit/delete one from the UI yet.
4. **Dealer document uploads**: the Ledger model has a `documents` array and the generic
   `POST /api/uploads` endpoint exists (already wired into the Expense Claim receipt upload
   as a working example) - wire the same pattern into the Dealer form's "Additional
   Information" tab for GST Certificate/PAN/Address Proof/Bank Proof/Other Documents.
5. **Sales/Purchase bill item pricing from the Item master**: the Sales/Purchase line-item
   forms still take a manual rate per line - now that Items carry `mrp`/`rateA`/`rateB`,
   auto-suggest one of those when an item is picked (still editable).
6. **Pagination**: if a list (Ledgers, Sales Bills) grows into the thousands, switch that
   screen to read `{ data, pagination }` once the matching backend endpoint is paginated
   (see backend README).
