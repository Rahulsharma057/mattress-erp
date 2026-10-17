# ERP Implementation Plan — FINALIZED DESIGN, PENDING YOUR APPROVAL TO START CODING

Maps `ERP_REQUIREMENTS.md`/`ERP_WORKFLOW_MAP.md` to concrete files. All four previously-open items are now resolved and reflected below as final. **COMPANY_STATE is the only remaining blocker** (R1–R4 below do not depend on it at all; R5 does). Nothing in this plan has been implemented — no application code, database record, or config has been touched.

## Final proposed implementation sequence

1. **Opening Stock** (Stock-in-Hand / Opening Balance Equity ledgers + entry screen) — introduces the new equity-ledger pattern other phases will reuse; otherwise fully independent.
2. **Salesman Custody & Handover** (Salesman Collections In Hand ledger + handover flow) — independent of 1 and 3.
3. **Dispatch Return + Damaged Goods + Scrap Sale** — the largest single change (Credit Note, Dispatch, ItemVariant, and a GST-aware scrap-sale posting together); depends on nothing new from 1/2.
4. **COMPANY_STATE** — config-only, zero code, can happen in parallel with 1–3 the moment you provide the value; blocks only the GST-split verification, not the rest of this plan.

---

## 1. Opening Stock

**New ledgers (seed, `backend/src/seed/seedMasters.js`):**
- `"Stock-in-Hand"` — new asset ledger.
- `"Opening Balance Equity"` — new dedicated equity ledger (not Capital Account).

**Model changes:**
- `backend/src/models/StockTransaction.js` — add `"opening_stock"` to the `type` enum; add `valuationRate: Number`.
- `backend/src/models/ItemVariant.js` — no change (reuses existing `stockQty`).

**New controller/route:**
- `createOpeningStock(req, res)` (`backend/src/controllers/itemController.js`) — `POST /api/masters/items/:id/opening-stock`, body `{length?, width?, thickness?, density?, unit?, quantity, valuationRate}`.
  - Resolves/creates the variant via existing `getOrCreateVariant`.
  - Guard: reject if any `StockTransaction` already exists for that variant — *"This specification already has stock movements - use Stock Adjustment instead."*
  - Inside `withTransaction`: `applyVariantStockDelta` (+quantity), `StockTransaction.create({type:"opening_stock", variant, quantity, valuationRate})`, Voucher: **Dr "Stock-in-Hand" / Cr "Opening Balance Equity"**, amount = `quantity × valuationRate`.

**Frontend:** "Add Opening Stock" entry point inside the existing Item Master "View" (variants) dialog.

**Migration/data risk:** none — additive only. Existing variants with real Purchase/Work-Order history are correctly blocked by the guard.

**Acceptance tests:**
- New spec, qty 50 @ ₹120 → variant created, `stockQty = 50`, Voucher Dr Stock-in-Hand ₹6,000 / Cr Opening Balance Equity ₹6,000, Trial Balance still balances.
- Repeat on the same variant → rejected.
- Attempt on a variant with existing Purchase history → rejected with the Stock Adjustment message.

**Reconciliation check:** `"Stock-in-Hand"` ledger balance == sum of `quantity × valuationRate` across every `opening_stock` `StockTransaction` ever posted. Nothing else touches either new ledger in this phase, so this must hold exactly, always.

---

## 2. Salesman Custody & Handover

**Model changes:**
- `backend/src/models/Collection.js` — add `handoverStatus: enum["pending","partial","handed_over"] default "pending"`, `handedOverAmount: Number default 0`.
- `backend/src/models/Voucher.js` — extend the existing `allocations` sub-schema with `collection: ObjectId ref Collection` (third allocation target, alongside the existing `salesBill`/`purchaseBill` — reused pattern, not duplicated).

**New ledger (seed):** `"Salesman Collections In Hand"` (asset) — one shared ledger for every salesman; which salesman owns how much is read from the existing `salesman` field on Collection/Voucher, never a per-user ledger.

**Controller changes:**
- `collectionController.js::reviewCollection` — Dr leg changes from `resolveSettlementLedgerName(paymentMode)` to the fixed `"Salesman Collections In Hand"` ledger. Dealer Cr leg, the single-approval guard, and `voucherId` guard are unchanged.
- New `recordHandover(req, res)` — `POST /api/salesman/handover`, body `{salesman, mode: "itemized"|"lumpsum", collectionIds?, amount?, settlementLedger}`.
  - Itemized: validates each collection belongs to `salesman` and `handoverStatus != "handed_over"`; posts each one's full remaining amount.
  - Lump-sum: fetches that salesman's not-fully-handed-over collections oldest-first, allocates the entered amount across them (same allocation-clipping approach already used for Sales/Purchase payment allocation in `services/outstandingCalc.js`).
  - Posts one Handover Voucher: **Dr settlement ledger (selected Cash/Bank) / Cr "Salesman Collections In Hand"**, `allocations: [{collection, amount}, ...]`.
  - Updates each covered Collection's `handedOverAmount`/`handoverStatus`. Wrapped in `withTransaction`.
- New `GET /api/salesman/custody-summary?salesman=` — pending amount per salesman, for the handover screen.

**Frontend:** new "Salesman Custody / Handover" screen (tab on Collection Approvals or a new page) — pending total per salesman, itemized checklist, lump-sum input with a live allocation preview before submit.

**Migration/data risk:** collections already `approved` before this change keep their existing (Cash/Bank-posted) voucher untouched. One-time backfill script sets their `handoverStatus = "handed_over"` (the only consistent reading — their money already reached Cash/Bank under the old logic, so marking them "still pending handover" would be wrong, not a guess).

**Acceptance tests:**
- Approve a collection → Dr custody / Cr dealer posted once; re-approval attempt → rejected (existing guard).
- Itemized handover of one collection → Dr Cash / Cr custody, `handoverStatus → "handed_over"`.
- Lump-sum handover across 3 collections where the amount only covers 2 fully + part of the 3rd → correct split, 3rd shows `"partial"`.
- Attempt to hand over an already-fully-handed-over collection → rejected.

**Reconciliation check:** `"Salesman Collections In Hand"` ledger balance == sum of `(amount - handedOverAmount)` across every Collection with `handoverStatus != "handed_over"`, at all times.

---

## 3. Dispatch Return + Damaged Goods + Scrap Sale

**Model changes:**
- `backend/src/models/Dispatch.js` — add `returnProcessed: Boolean default false`, `creditNoteRef: ObjectId ref Voucher`.
- `backend/src/models/ItemVariant.js` — add `damagedQty: Number default 0`.
- `backend/src/models/BillItem.js` — add `damagedQty: Number default 0` alongside `quantity`.
- `backend/src/models/StockTransaction.js` — add `"damage_in"`, `"damage_writeoff"`, `"damage_scrap_sale"` to the `type` enum.

**New ledger (seed):** `"Scrap Sales Income"` (income) — only touched by a scrap sale.

**Controller changes — Return processing:**
- `creditDebitNoteController.js::createCreditNote` — accept optional `dispatchRef`; extend `assertWithinReturnableQuantity` to also check per-dispatch (not only per-bill), so a bill with multiple dispatches can't have one dispatch's goods credited twice just because the bill-level total still has room. Per line with `damagedQty > 0`: new `applyDamagedStockDelta` (mirrors `applyVariantStockDelta`) adds to `ItemVariant.damagedQty`; the remaining `quantity - damagedQty` follows the existing good-stock path unchanged. If `dispatchRef` given: `Dispatch.returnProcessed = true`, `creditNoteRef = <voucher>`.
- `creditDebitNoteController.js::cancelCreditNote` — extended to also reverse `damagedQty` where applicable and clear `Dispatch.returnProcessed`/`creditNoteRef`.
- `dispatchController.js` — new `getReturnableLines(dispatchId)` (mirrors existing `getRemainingLines`, scoped to one dispatch).

**Controller changes — Disposal:**
- `POST /api/masters/items/:id/variants/:variantId/damaged/writeoff` (admin/super_admin only) — `damagedQty -= qty`, `StockTransaction` (`"damage_writeoff"`). **No accounting entry** — finalized reasoning: no verified inventory valuation exists on these books to credit down (see `ERP_REQUIREMENTS.md` R3a).
- `POST /api/masters/items/:id/variants/:variantId/damaged/scrap-sale` (admin/super_admin only) — body `{quantity, rate, hsn, buyerParty?, paymentMode, settlementLedger}`. Reuses the existing `gstSplit`/`computeLineAmounts` machinery (same CGST+SGST-vs-IGST alternative-not-additive rule as every other GST posting): **Dr Cash/Bank (incl. GST) / Cr "Scrap Sales Income" (base) / Cr Output CGST+SGST or Output IGST**. `damagedQty -= quantity`, `StockTransaction` (`"damage_scrap_sale"`).

**Frontend:**
- Dispatch page: "Process Return" action on a `"returned"` dispatch → per-line Returned/Good/Damaged inputs, submits to the extended Credit Note endpoint.
- Item Master "View" dialog: add a "Damaged" column + Write-off/Scrap-Sale actions (admin/super_admin only).

**Migration/data risk:** low — every new field defaults to `0`/`false`; no existing Dispatch/ItemVariant/Credit-Note record is reinterpreted. The per-dispatch over-return check is strictly additive to the existing per-bill check (can only catch more, never allow something previously blocked).

**Acceptance tests:**
- Dispatch → Returned → Process Return splitting 7 good / 3 damaged → dealer balance drops by the credited amount; `stockQty += 7`; `damagedQty += 3`; `returnProcessed = true`.
- Re-processing the same dispatch's return → rejected.
- Cancelling that Credit Note → both `stockQty` and `damagedQty` reverse; `returnProcessed` clears.
- Write off 2 of the 3 damaged units → `damagedQty → 1`, zero accounting entries created.
- Scrap-sell the last 1 unit for ₹50 + GST under a chosen HSN → `damagedQty → 0`; Dr Cash ₹(50+GST); Cr Scrap Sales Income ₹50; Cr Output GST for the tax portion; Dr=Cr exactly.

**Reconciliation checks:**
- `ItemVariant.damagedQty` == sum of `damage_in` − sum of (`damage_writeoff` + `damage_scrap_sale`) for that variant, always.
- `"Scrap Sales Income"` ledger credit total == sum of every `damage_scrap_sale` base amount.

---

## 4. COMPANY_STATE

Config-only, zero code: set `COMPANY_STATE` in `backend/.env` to the value you provide, restart the backend. I will then verify live — same method as the original GST-doubling fix — that an intra-state sale splits CGST+SGST and an inter-state one splits IGST, never both, and that the new Scrap Sale flow (which reuses the same split) is correct too.

---

## What this plan explicitly does NOT do

- Does not touch `Ledger.openingBalance` — deferred to a separate later phase, dependencies checked and documented (`ERP_REQUIREMENTS.md`, "R2 (gap)").
- Does not post any accounting entry for a zero-recovery damaged write-off — no verified valuation basis exists to post against.
- Does not guess or default `COMPANY_STATE`, GSTIN, or registered address under any circumstance.
- Does not rewrite, delete, or reinterpret any existing posted Voucher, SalesBill, PurchaseBill, or ItemVariant record.

---

## Business decision still required from you

**Only one:** the company's GST-registered state (optionally GSTIN + registered address for printed headers) — everything else in this plan is finalized and ready to build.

**Waiting for:** that value, and your explicit go-ahead on this plan, before writing or changing any code, database record, or configuration.
