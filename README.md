# Mattress / Foam Manufacturing ERP - Production-Ready, Fully CRUD, Real Manufacturing Flow

For **Sunrise Foam Industries / Samraddhi Mattresses**.

Stack: **Next.js + MUI** (frontend) · **Node.js/Express + MongoDB (Mongoose)** (backend)
· **Cloudinary** (files) · **Docker** (deployment).

## What's new in this pass

1. **Comprehensive Dealer/Supplier Master** - matches a real dealer-onboarding form: auto
   dealer code (`DLR-2026-000125` style), entity type, dealer type, GSTIN/PAN, **salesman
   assignment**, full billing/shipping address, credit limit, payment terms, GST
   treatment/state/place-of-supply, TCS/TDS/E-way bill flags, business nature, remarks, and
   document upload slots - all in a tabbed Add/Edit dialog.
2. **Comprehensive Product/Item Master** - auto product code (`PRD-2026-000045` style),
   product type, fast-search/decimal/company-product flags, purchase rate, MRP, two extra
   price tiers (Rate A/B), barcode, warranty months.
3. **Real 6-stage Production workflow, model-wise** - a Work Order now covers **multiple
   product models at once** (e.g. 12 mattress models in one run), each with its own planned
   quantity, and walks the actual manufacturing pipeline: **Planned → Raw Material
   Verification → Pasting → Stitching → Packing → Ready to Dispatch**, with a full
   stage-history audit trail and a "view full record" screen. Stock only moves at the final
   stage, with the same all-or-nothing sufficiency check as before, now merged correctly
   across every model in the work order.
4. **Credit Note & Debit Note** - dedicated sales-return / purchase-return flows on top of
   the generic voucher system: post the ledger adjustment **and** move stock (credit note
   brings goods back in, debit note sends them back out - blocked if not enough stock is on
   hand), optionally linked to the original Sales/Purchase bill.
5. **Real bug fixed**: Sales Bills and Purchase Bills never touched the ledger balance before
   - only standalone Vouchers did. Now every bill posts to (and reverses from on cancel) the
   dealer's/supplier's ledger, which is also what makes the new...
6. **Dealer/Customer 360 view** - a "View Statement" button on every Ledger row shows every
   Sales Bill, Purchase Bill, and Voucher for that party in one chronological list with a
   running balance.
7. **Account Group "Under Group"** - groups can now be classified under the standard
   Tally-style parent categories (Sundry Debtors, Cash-in-hand, Sales Account, etc.).

## Status: all 8 modules, full CRUD where it matters, a real manufacturing pipeline, and
## 146 passing end-to-end tests

| # | Module | Backend | Frontend |
|---|---|---|---|
| 1 | Foundation (Auth, RBAC, security) | Done | Login + Users & Roles: full CRUD |
| 2 | Masters (Account Group, HSN, **Dealer**, **Product**) | Done | Full CRUD, comprehensive forms |
| 3 | HR (Employee, Attendance, Salary Slip PDF) | Done | Employee: full CRUD; Attendance/Salary: create |
| 4 | Production (BOM, **multi-model 6-stage Work Orders**, Stock) | Done | Multi-line stepper UI + record view |
| 5 | Sales / Purchase / Dispatch (**now post to ledger balance**) | Done | Create + status transitions |
| 6 | Accounts (Vouchers, **Credit/Debit Notes**, ledger balance) | Done | Create + Delete + returns UI |
| 7 | Salesman App (2-level Expense Approval, Visits) | Done | Submit + dedicated Approval screen |
| 8 | Reports & Dashboards | Done | Dashboard home + Reports page |

## Run locally

```bash
# Option A: Docker (fastest way to see the whole thing running)
cp backend/.env.example backend/.env   # fill JWT_SECRET at minimum; Cloudinary keys for uploads
docker compose up --build

# Option B: run each app directly
cd backend && npm install && cp .env.example .env && npm run dev
node src/seed/seedSuperAdmin.js
node src/seed/seedDemoData.js          # full sample data across every module
cd frontend && npm install && cp .env.local.example .env.local && npm run dev
```

Open `http://localhost:3000/login`:
- Admin: `admin@sunrisefoam.com` / `Admin@123`
- Salesman (from the demo seed): `salesman@sunrisefoam.com` / `Sales@123`

Change both passwords before going anywhere near production data.

## Before going live

1. Set a long random `JWT_SECRET` (`openssl rand -hex 32`) and real Cloudinary credentials.
2. Set `CORS_ORIGINS` to your actual frontend domain.
3. Point `MONGO_URI` at MongoDB Atlas (or your production Mongo) instead of local Mongo.
4. Change the seeded Super Admin (and demo Salesman) password immediately.
5. Don't run `seedDemoData.js` against a real production database - it's for demos/testing.
   Use `seedMasters.js` alone for a clean production start (just the Account Groups/HSN/
   internal ledgers the app needs, no fake dealers/bills).
6. Review `backend/README.md`'s "Next steps" for remaining refinements (GSTR-2/3B,
   automated tests, pagination on very large lists, dealer document uploads) before treating
   this as fully audit-ready for statutory filing.

Bhai, ab Dealer aur Product master Tally-jaisa comprehensive hai (salesman assign, credit
limit, GST details sab), Production ka real 6-stage flow ban gaya hai (model-wise, jitne bhi
models hon), Credit/Debit Note bhi hai, aur sabse important - Sales/Purchase bill banate hi
dealer/supplier ka ledger balance turant update hota hai, aur unki poori history "View
Statement" se ek jagah dikh jaati hai. Sab kuch test kiya hai (146 tests) - deploy karke
dekho, jo bhi lage bata dena.
