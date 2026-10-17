"use client";

import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Typography, Box, Grid, TextField, MenuItem, Button, Table, TableHead,
  TableRow, TableCell, TableBody, Paper, TableContainer, Chip, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, Divider, TablePagination, InputAdornment,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import HistoryIcon from "@mui/icons-material/History";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useSnackbar } from "@/components/SnackbarProvider";

interface Ledger {
  _id: string; name: string;
  accountGroup?: { name: string };
  bankAccountHolderName?: string; bankAccountNumber?: string; bankIfscCode?: string; bankName?: string;
}
interface Item { _id: string; name: string; unit: string; sgst: number; cgst: number; igst: number; stockQty?: number; }
interface ItemVariant { _id: string; sizeLabel: string; isUnspecified: boolean; availableQty: number; }
interface Line {
  item: string; quantity: string; rate: string; sgst: number; cgst: number; igst: number;
  variant: string; // an existing variant id, or the sentinel "__new__" to reveal the dimension inputs below
  length: string; width: string; thickness: string; density: string;
}
interface PurchaseBillRow {
  _id: string; billNumber: string; billType: string; date: string;
  supplier: { _id: string; name: string }; totalAmount: number; paymentStatus: string; status: string;
}
interface OpenBill { purchaseBill: string; billNumber: string; totalAmount: number; allocatedAmount: number; outstandingAmount: number; }
interface PaymentRecord { _id: string; voucherNumber: string; date: string; amount: number; paymentMode?: string; account: string; referenceNumber?: string; }

// ---------- Theme tokens (Production / Item Master / Sales jaisi hi green theme) ----------
const T = {
  green: "#388e3c",
  greenDark: "#2e7d32",
  greenHover: "#276b2b",
  greenLight: "#e8f5e9",
  ink: "#14281b",
  border: "#e3ebe4",
  rowBorder: "#edf1ed",
  red: "#d32f2f",
  redLight: "#ffebee",
  amber: "#ed6c02",
  amberLight: "#fff3e0",
  blue: "#1976d2",
  blueLight: "#e3f2fd",
  grey: "#546e7a",
  greyLight: "#eceff1",
  shadow: "0 1px 3px rgba(20,40,27,0.06)",
};

const cardSx = { borderRadius: 3, borderColor: T.border, boxShadow: T.shadow, bgcolor: "#fff", overflow: "hidden" } as const;

// Green header row for every table on this page
const tableSx = {
  "& .MuiTableCell-root": { py: 0.5, px: 1.5, borderColor: T.rowBorder },
  "& .MuiTableCell-head": {
    bgcolor: T.greenDark, color: "#fff", fontWeight: 700, fontSize: 12,
    textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap", py: 1,
  },
  "& .MuiTableCell-body": { fontVariantNumeric: "tabular-nums", verticalAlign: "middle", fontSize: 13.5 },
} as const;

const sectionLabelSx = { color: T.greenDark, fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 } as const;
const pillSx = { height: 22, fontSize: 12, fontWeight: 600 } as const;
const iconBtnSx = { width: 28, height: 28 } as const;

const emptyLine: Line = { item: "", quantity: "1", rate: "0", sgst: 0, cgst: 0, igst: 0, variant: "", length: "", width: "", thickness: "", density: "" };
const NEW_SPEC = "__new__";

const paymentStyle: Record<string, { bg: string; fg: string }> = {
  pending: { bg: T.amberLight, fg: T.amber },
  partial: { bg: T.blueLight, fg: T.blue },
  paid: { bg: T.greenLight, fg: T.green },
};
const statusStyle: Record<string, { bg: string; fg: string }> = {
  confirmed: { bg: T.greenLight, fg: T.green },
  cancelled: { bg: T.redLight, fg: T.red },
};
const billTypeLabel: Record<string, string> = { purchase_bill: "Purchase Bill", purchase_order: "Purchase Order (Draft)" };
const PAYMENT_MODES = [
  { value: "cash", label: "Cash" }, { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" }, { value: "neft", label: "NEFT" },
  { value: "rtgs", label: "RTGS" }, { value: "cheque", label: "Cheque" }, { value: "other", label: "Other" },
];

// Shared dialog header: green bar (+ optional subtitle) + close button
function DialogHeader({ title, subtitle, onClose }: { title: ReactNode; subtitle?: string; onClose: () => void }) {
  return (
    <DialogTitle sx={{ bgcolor: T.green, color: "#fff", py: 1.25, pr: 6 }}>
      <Typography component="div" fontSize={17} fontWeight={700} lineHeight={1.3}>{title}</Typography>
      {subtitle && <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.85)" }} display="block">{subtitle}</Typography>}
      <IconButton size="small" aria-label="close" onClick={onClose} sx={{ color: "#fff", position: "absolute", right: 12, top: 10 }}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </DialogTitle>
  );
}

export default function PurchasePage() {
  const { user } = useAuthStore();
  const { showMessage } = useSnackbar();
  const [suppliers, setSuppliers] = useState<Ledger[]>([]);
  const [allLedgers, setAllLedgers] = useState<Ledger[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [bills, setBills] = useState<PurchaseBillRow[]>([]);
  const [billsTotal, setBillsTotal] = useState(0);
  const [billsPage, setBillsPage] = useState(0); // MUI TablePagination is 0-indexed
  const [billsRowsPerPage, setBillsRowsPerPage] = useState(10);
  const [billsSearchInput, setBillsSearchInput] = useState("");
  const [billsSearch, setBillsSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setBillsSearch(billsSearchInput), 300);
    return () => clearTimeout(t);
  }, [billsSearchInput]);
  useEffect(() => { setBillsPage(0); }, [billsSearch]);
  const [supplier, setSupplier] = useState("");
  const [billType, setBillType] = useState("purchase_bill");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<PurchaseBillRow | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);
  const [confirmOrderTarget, setConfirmOrderTarget] = useState<PurchaseBillRow | null>(null);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [confirmPayOpen, setConfirmPayOpen] = useState(false);

  // Make Payment dialog - direct accountant-entered payment against a supplier's open bills.
  const [payTarget, setPayTarget] = useState<PurchaseBillRow | null>(null);
  const [payOpenBills, setPayOpenBills] = useState<OpenBill[]>([]);
  const [payForm, setPayForm] = useState({ amount: "", paymentMode: "cash", referenceNumber: "", narration: "", settlementLedger: "" });
  const [payAlloc, setPayAlloc] = useState<Record<string, string>>({});
  const [paying, setPaying] = useState(false);

  // Payment History - every Payment voucher allocated against a specific bill, with a
  // printable receipt per payment (see backend getPurchaseBillPayments / getVoucherReceipt).
  const [historyTarget, setHistoryTarget] = useState<PurchaseBillRow | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [printingId, setPrintingId] = useState<string | null>(null);

  const openPaymentHistory = async (bill: PurchaseBillRow) => {
    setHistoryTarget(bill);
    setHistoryLoading(true);
    try {
      const res = await api.get(`/purchase/${bill._id}/payments`);
      setPaymentHistory(res.data);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Opens the printable Receipt PDF in a new tab - fetched as a blob (not a plain <a href>)
  // because the API needs the Bearer token, which only axios's interceptor attaches. This
  // only ever READS an already-posted voucher; it cannot create a new one.
  const handlePrintReceipt = async (voucherId: string) => {
    setPrintingId(voucherId);
    try {
      const res = await api.get(`/accounts/${voucherId}/receipt`, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      window.open(blobUrl, "_blank");
    } finally {
      setPrintingId(null);
    }
  };

  const loadData = async () => {
    // allSettled, not all - these four are independent, and Promise.all would let ONE slow/
    // failing request wipe out data that DID load successfully, since none of the setters
    // would run at all (see the matching note in sales/page.tsx's loadData).
    const [supplierRes, allLedgerRes, itemRes, billRes] = await Promise.allSettled([
      // Only real suppliers - previously this had no entityType filter, so every ledger
      // (Cash Account, Purchase Account, GST ledgers...) showed up as if it were a vendor.
      api.get("/masters/ledgers", { params: { entityType: "supplier" } }),
      api.get("/masters/ledgers"),
      api.get("/masters/items"),
      api.get("/purchase", { params: {
        page: billsPage + 1, limit: billsRowsPerPage,
        search: billsSearch || undefined,
      } }),
    ]);
    if (supplierRes.status === "fulfilled") setSuppliers(supplierRes.value.data);
    if (allLedgerRes.status === "fulfilled") setAllLedgers(allLedgerRes.value.data);
    if (itemRes.status === "fulfilled") setItems(itemRes.value.data);
    if (billRes.status === "fulfilled") {
      setBills(billRes.value.data.bills);
      setBillsTotal(billRes.value.data.pagination.total);
    }
  };

  // Our own settlement accounts (Cash + every ledger under "Bank Accounts") - lets the user
  // pick WHICH bank account money actually moved through when there is more than one,
  // instead of it always collapsing into a single hard-coded "Bank Account" ledger.
  const settlementAccounts = allLedgers.filter((l) => l.accountGroup?.name === "Cash" || l.accountGroup?.name === "Bank Accounts");

  useEffect(() => { loadData(); }, [billsPage, billsRowsPerPage, billsSearch]);

  const updateLine = (idx: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  // Per-item cache of existing specifications (see models/ItemVariant.js) - Purchase may
  // reuse one of these OR register a brand-new size (unlike Sales, which may only select one
  // that already has stock).
  const [itemVariants, setItemVariants] = useState<Record<string, ItemVariant[]>>({});
  const loadVariantsFor = async (itemId: string) => {
    if (!itemId || itemVariants[itemId]) return;
    const res = await api.get(`/masters/items/${itemId}/variants`);
    setItemVariants((prev) => ({ ...prev, [itemId]: res.data }));
  };

  const handleItemSelect = (idx: number, itemId: string) => {
    const selected = items.find((it) => it._id === itemId);
    updateLine(idx, {
      item: itemId, variant: "", length: "", width: "", thickness: "", density: "",
      sgst: selected?.sgst || 0, cgst: selected?.cgst || 0, igst: selected?.igst || 0,
    });
    loadVariantsFor(itemId);
  };

  const addLine = () => setLines((prev) => [...prev, { ...emptyLine }]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  // igst = sgst + cgst by design (see backend HsnSac model) - alternatives for the SAME total
  // rate, never added together. The backend decides which actually gets posted (see
  // utils/gstSplit); this preview just needs the correct total.
  const gstPercent = (l: Line) => (l.igst > 0 ? l.igst : (l.sgst || 0) + (l.cgst || 0));
  const lineAmount = (l: Line) => {
    const base = Number(l.quantity) * Number(l.rate);
    const tax = (base * gstPercent(l)) / 100;
    return Math.round(base + tax);
  };
  const grandTotal = lines.reduce((sum, l) => sum + lineAmount(l), 0);
  const subTotal = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0);
  const gstTotal = Math.max(0, grandTotal - Math.round(subTotal));

  const handleSave = async () => {
    setConfirmSaveOpen(false);
    setSaving(true);
    try {
      await api.post("/purchase", {
        supplier, billType,
        items: lines.map((l) => ({
          item: l.item, quantity: Number(l.quantity), rate: Number(l.rate),
          sgst: l.sgst, cgst: l.cgst, igst: l.igst,
          // An existing specification is sent as `variant`; a brand-new one (or "unknown for
          // now") is sent as raw dimensions instead, which the backend resolves/creates into
          // a variant itself (see services/itemVariants.getOrCreateVariant) - never both.
          variant: l.variant !== NEW_SPEC ? l.variant : undefined,
          length: l.variant === NEW_SPEC ? (l.length || undefined) : undefined,
          width: l.variant === NEW_SPEC ? (l.width || undefined) : undefined,
          thickness: l.variant === NEW_SPEC ? (l.thickness || undefined) : undefined,
          density: l.variant === NEW_SPEC ? (l.density || undefined) : undefined,
        })),
      });
      showMessage("Purchase bill saved", "success");
      setSupplier(""); setBillType("purchase_bill");
      setLines([{ ...emptyLine }]);
      setCreateOpen(false);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const updatePaymentStatus = async (id: string, paymentStatus: string) => {
    await api.put(`/purchase/${id}/payment-status`, { paymentStatus });
    await loadData();
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await api.put(`/purchase/${cancelTarget._id}/cancel`);
      showMessage("Purchase bill cancelled, stock and ledger postings reversed", "success");
      setCancelTarget(null);
      await loadData();
    } finally {
      setCancelling(false);
    }
  };

  const handleConfirmOrder = async () => {
    if (!confirmOrderTarget) return;
    setConfirmingOrderId(confirmOrderTarget._id);
    try {
      await api.put(`/purchase/${confirmOrderTarget._id}/confirm`, {});
      showMessage("Purchase order confirmed into a bill - stock and ledger posted", "success");
      setConfirmOrderTarget(null);
      await loadData();
    } finally {
      setConfirmingOrderId(null);
    }
  };

  const openMakePayment = async (bill: PurchaseBillRow) => {
    setPayTarget(bill);
    const cashLedger = settlementAccounts.find((a) => a.accountGroup?.name === "Cash");
    setPayForm({ amount: "", paymentMode: "cash", referenceNumber: "", narration: "", settlementLedger: cashLedger?._id || "" });
    const res = await api.get(`/masters/ledgers/${bill.supplier._id}/open-purchase-bills`);
    setPayOpenBills(res.data);
    const thisBill = res.data.find((b: OpenBill) => b.purchaseBill === bill._id);
    if (thisBill) {
      setPayAlloc({ [bill._id]: String(thisBill.outstandingAmount) });
      setPayForm((f) => ({ ...f, amount: String(thisBill.outstandingAmount) }));
    } else {
      setPayAlloc({});
    }
  };

  const payAllocTotal = Object.values(payAlloc).reduce((t, v) => t + (Number(v) || 0), 0);
  const payUnallocated = Math.max(0, Number(payForm.amount || 0) - payAllocTotal);

  const setPayAllocation = (purchaseBill: string, value: string, cap: number) => {
    const num = Number(value);
    const clamped = Number.isFinite(num) ? Math.max(0, Math.min(num, cap)) : 0;
    setPayAlloc({ ...payAlloc, [purchaseBill]: value === "" ? "" : String(clamped) });
  };

  const submitMakePayment = async () => {
    if (!payTarget) return;
    setConfirmPayOpen(false);
    setPaying(true);
    try {
      const allocations = Object.entries(payAlloc)
        .map(([purchaseBill, amt]) => ({ purchaseBill, amount: Number(amt || 0) }))
        .filter((a) => a.amount > 0);
      await api.post("/accounts/make-payment", {
        supplier: payTarget.supplier._id,
        amount: Number(payForm.amount || 0),
        paymentMode: payForm.paymentMode,
        referenceNumber: payForm.referenceNumber || undefined,
        narration: payForm.narration || undefined,
        settlementLedger: payForm.settlementLedger || undefined,
        allocations,
      });
      showMessage("Payment made and posted", "success");
      setPayTarget(null);
      await loadData();
    } finally {
      setPaying(false);
    }
  };

  const canSave = supplier && lines.every((l) => l.item && l.variant && Number(l.quantity) > 0);
  const canCancel = user?.role === "super_admin" || user?.role === "admin";

  return (
    <>
      {/* ---------- Page header ---------- */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5} gap={2} flexWrap="wrap">
        <Box display="flex" alignItems="center" gap={1.25}>
          <ShoppingCartOutlinedIcon sx={{ fontSize: 34, color: T.greenDark }} />
          <Box>
            <Typography variant="h6" fontWeight={700} lineHeight={1.2} sx={{ color: T.ink }}>Purchase</Typography>
            <Typography variant="caption" color="text.secondary">Recent purchase bills, make payments and view payment history.</Typography>
          </Box>
        </Box>
        <Button variant="contained" disableElevation startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}
          sx={{ bgcolor: T.greenDark, "&:hover": { bgcolor: T.greenHover }, fontWeight: 700, px: 2.5, height: 36, borderRadius: 1.5 }}>
          New Purchase Bill
        </Button>
      </Box>

      {/* ---------- Recent purchases table ---------- */}
      <Paper variant="outlined" sx={cardSx}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: T.rowBorder, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
          <Typography fontWeight={700} sx={{ color: T.ink }}>Recent Purchases</Typography>
          <Box display="flex" alignItems="center" gap={1.5}>
            <TextField
              size="small" placeholder="Search bill no. or supplier..." value={billsSearchInput}
              onChange={(e) => setBillsSearchInput(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
              sx={{ width: 220, "& .MuiOutlinedInput-root": { height: 32, fontSize: 13 } }}
            />
            <Typography variant="body2" color="text.secondary">{billsTotal} bill{billsTotal === 1 ? "" : "s"}</Typography>
          </Box>
        </Box>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ ...tableSx, minWidth: 960 }}>
            <TableHead>
              <TableRow>
                <TableCell>Bill No</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Supplier</TableCell>
                <TableCell>Date</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Payment</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bills.map((b) => {
                const pay = paymentStyle[b.paymentStatus] ?? paymentStyle.pending;
                const st = statusStyle[b.status] ?? statusStyle.confirmed;
                return (
                  <TableRow key={b._id} hover sx={{ height: 42 }}>
                    <TableCell><Typography variant="body2" fontWeight={700} noWrap sx={{ color: T.greenDark }}>{b.billNumber}</Typography></TableCell>
                    <TableCell><Chip size="small" label={billTypeLabel[b.billType] || b.billType} sx={{ ...pillSx, bgcolor: T.greyLight, color: T.grey }} /></TableCell>
                    <TableCell><Typography variant="body2" fontWeight={600} noWrap>{b.supplier?.name}</Typography></TableCell>
                    <TableCell>{new Date(b.date).toLocaleDateString("en-IN")}</TableCell>
                    <TableCell align="right"><b>₹{b.totalAmount.toLocaleString("en-IN")}</b></TableCell>
                    <TableCell>
                      {/* Click the chip to change payment status (same behaviour as before) */}
                      <TextField select size="small" variant="standard" value={b.paymentStatus} disabled={b.status === "cancelled"}
                        onChange={(e) => updatePaymentStatus(b._id, e.target.value)}
                        InputProps={{ disableUnderline: true }}
                        SelectProps={{
                          renderValue: () => (
                            <Chip size="small" label={b.paymentStatus} sx={{ ...pillSx, bgcolor: pay.bg, color: pay.fg, textTransform: "capitalize", cursor: "pointer" }} />
                          ),
                        }}
                        sx={{ "& .MuiSelect-select": { py: 0, display: "flex", alignItems: "center" } }}>
                        <MenuItem value="pending">Pending</MenuItem>
                        <MenuItem value="partial">Partial</MenuItem>
                        <MenuItem value="paid">Paid</MenuItem>
                      </TextField>
                    </TableCell>
                    <TableCell><Chip size="small" label={b.status} sx={{ ...pillSx, bgcolor: st.bg, color: st.fg, textTransform: "capitalize" }} /></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Box display="flex" gap={0.25} justifyContent="flex-end">
                        {b.billType === "purchase_order" && (
                          <Tooltip title="Confirm into a real bill (posts stock and ledger)">
                            <span>
                              <IconButton size="small" sx={{ ...iconBtnSx, color: T.green }} disabled={confirmingOrderId === b._id} onClick={() => setConfirmOrderTarget(b)}>
                                <CheckCircleOutlineIcon sx={{ fontSize: 18 }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                        {b.billType === "purchase_bill" && b.status !== "cancelled" && (
                          <Tooltip title="Make Payment">
                            <IconButton size="small" sx={{ ...iconBtnSx, color: T.green }} onClick={() => openMakePayment(b)}><PaymentsOutlinedIcon sx={{ fontSize: 18 }} /></IconButton>
                          </Tooltip>
                        )}
                        {b.billType === "purchase_bill" && (
                          <Tooltip title="Payment History">
                            <IconButton size="small" sx={iconBtnSx} onClick={() => openPaymentHistory(b)}><HistoryIcon sx={{ fontSize: 18 }} /></IconButton>
                          </Tooltip>
                        )}
                        {canCancel && b.status !== "cancelled" && (
                          <Tooltip title="Cancel (reverses stock and ledger postings)">
                            <IconButton size="small" sx={{ ...iconBtnSx, color: T.red }} onClick={() => setCancelTarget(b)}><DeleteOutlineIcon sx={{ fontSize: 18 }} /></IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
              {bills.length === 0 && (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4, color: "text.secondary" }}>No purchase bills yet - 'New Purchase Bill' se pehla banao</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div" count={billsTotal} page={billsPage} onPageChange={(_, p) => setBillsPage(p)}
          rowsPerPage={billsRowsPerPage} onRowsPerPageChange={(e) => { setBillsRowsPerPage(Number(e.target.value)); setBillsPage(0); }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </Paper>

      {/* ---------- New Purchase Bill dialog ---------- */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="lg" fullWidth scroll="paper">
        <DialogHeader title="New Purchase Bill" subtitle="Pick the supplier and add items - stock and ledger post when you save." onClose={() => setCreateOpen(false)} />
        <DialogContent dividers sx={{ bgcolor: "#f6faf6", px: 2, py: 2 }}>
          {/* --- Bill details --- */}
          <Paper variant="outlined" sx={{ ...cardSx, p: 2, mb: 2, overflow: "visible" }}>
            <Typography sx={sectionLabelSx} mb={1.25}>Bill Details</Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6}>
                <TextField select fullWidth size="small" label="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                  {suppliers.map((s) => <MenuItem key={s._id} value={s._id}>{s.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField select fullWidth size="small" label="Bill Type" value={billType} onChange={(e) => setBillType(e.target.value)}>
                  <MenuItem value="purchase_bill">Purchase Bill</MenuItem>
                  <MenuItem value="purchase_order">Purchase Order (Draft)</MenuItem>
                </TextField>
              </Grid>
            </Grid>
          </Paper>

          {/* --- Items --- */}
          <Paper variant="outlined" sx={cardSx}>
            <Box sx={{ px: 2, py: 1, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: 1, borderColor: T.rowBorder }}>
              <Typography sx={sectionLabelSx}>Items ({lines.length})</Typography>
              <Button size="small" color="success" startIcon={<AddIcon />} onClick={addLine}>Add line</Button>
            </Box>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{
                tableLayout: "fixed", minWidth: 820,
                "& .MuiTableCell-root": { px: 1, py: 0.75, borderColor: T.rowBorder, verticalAlign: "top" },
                "& .MuiTableCell-head": { bgcolor: "#eef4ee", color: "#2c3e34", fontWeight: 700, fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.5, py: 0.75, verticalAlign: "middle" },
                "& .MuiOutlinedInput-root": { bgcolor: "#fff", fontSize: 14 },
              }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 36 }} align="center">#</TableCell>
                    <TableCell>Item</TableCell>
                    <TableCell sx={{ width: "26%" }}>Specification</TableCell>
                    <TableCell sx={{ width: 90 }}>Qty</TableCell>
                    <TableCell sx={{ width: 105 }}>Rate</TableCell>
                    <TableCell sx={{ width: 72 }} align="center">GST</TableCell>
                    <TableCell sx={{ width: 110 }} align="right">Amount</TableCell>
                    <TableCell sx={{ width: 44 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lines.map((line, idx) => {
                    const variantOptions = itemVariants[line.item] || [];
                    const selectedVariant = variantOptions.find((v) => v._id === line.variant);
                    return (
                      <Fragment key={idx}>
                        <TableRow sx={line.variant === NEW_SPEC ? { "& .MuiTableCell-root": { borderBottom: 0 } } : undefined}>
                          <TableCell align="center" sx={{ pt: 1.5, color: "text.secondary", fontWeight: 600 }}>{idx + 1}</TableCell>
                          <TableCell>
                            <TextField select fullWidth size="small" value={line.item}
                              SelectProps={{ displayEmpty: true, renderValue: (v) => { const it = items.find((i) => i._id === v); return it ? `${it.name} (${it.unit})` : <span style={{ color: "#9aa5a0" }}>Select item</span>; } }}
                              onChange={(e) => handleItemSelect(idx, e.target.value)}>
                              {items.map((it) => <MenuItem key={it._id} value={it._id}>{it.name} ({it.unit})</MenuItem>)}
                            </TextField>
                          </TableCell>
                          <TableCell>
                            <TextField select fullWidth size="small" value={line.variant} disabled={!line.item}
                              SelectProps={{
                                displayEmpty: true,
                                renderValue: (v) => {
                                  if (v === NEW_SPEC) return "New / Unknown Specification";
                                  const sv = variantOptions.find((x) => x._id === v);
                                  return sv ? sv.sizeLabel : <span style={{ color: "#9aa5a0" }}>Select specification</span>;
                                },
                              }}
                              onChange={(e) => updateLine(idx, { variant: e.target.value })}>
                              {variantOptions.map((v) => (
                                <MenuItem key={v._id} value={v._id}>{v.sizeLabel} (Stock: {v.availableQty})</MenuItem>
                              ))}
                              <MenuItem value={NEW_SPEC}>+ New / Unknown Specification</MenuItem>
                            </TextField>
                            {selectedVariant && (
                              <Typography variant="caption" display="block" mt={0.25} color="text.secondary">
                                Current stock: {selectedVariant.availableQty}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <TextField fullWidth size="small" type="number" value={line.quantity}
                              inputProps={{ min: 0 }} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                          </TableCell>
                          <TableCell>
                            <TextField fullWidth size="small" type="number" value={line.rate}
                              inputProps={{ min: 0 }} onChange={(e) => updateLine(idx, { rate: e.target.value })} />
                          </TableCell>
                          <TableCell align="center" sx={{ pt: 1.25 }}>
                            <Chip size="small" label={`${gstPercent(line).toFixed(0)}%`} sx={{ ...pillSx, bgcolor: T.greenLight, color: T.green }} />
                          </TableCell>
                          <TableCell align="right" sx={{ pt: 1.4 }}>
                            <Typography fontWeight={700} sx={{ color: T.ink }}>₹{lineAmount(line).toLocaleString("en-IN")}</Typography>
                          </TableCell>
                          <TableCell align="center" sx={{ pt: 0.75 }}>
                            <Tooltip title={lines.length === 1 ? "Kam se kam ek line chahiye" : "Remove line"}>
                              <span>
                                <IconButton size="small" color="error" aria-label="remove line" onClick={() => removeLine(idx)} disabled={lines.length === 1}>
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </TableCell>
                        </TableRow>

                        {/* New / unknown specification: optional dimensions */}
                        {line.variant === NEW_SPEC && (
                          <TableRow>
                            <TableCell />
                            <TableCell colSpan={7} sx={{ pt: 0 }}>
                              <Box sx={{ bgcolor: T.greenLight, borderRadius: 1.5, p: 1.25 }}>
                                <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                                  All optional - leave blank if the exact size isn&apos;t known yet (it lands in an &quot;Unspecified&quot; bucket until identified).
                                </Typography>
                                <Grid container spacing={1.5}>
                                  <Grid item xs={6} sm={3}>
                                    <TextField fullWidth size="small" type="number" label="Length" value={line.length}
                                      onChange={(e) => updateLine(idx, { length: e.target.value })} />
                                  </Grid>
                                  <Grid item xs={6} sm={3}>
                                    <TextField fullWidth size="small" type="number" label="Width" value={line.width}
                                      onChange={(e) => updateLine(idx, { width: e.target.value })} />
                                  </Grid>
                                  <Grid item xs={6} sm={3}>
                                    <TextField fullWidth size="small" type="number" label="Thickness" value={line.thickness}
                                      onChange={(e) => updateLine(idx, { thickness: e.target.value })} />
                                  </Grid>
                                  <Grid item xs={6} sm={3}>
                                    <TextField fullWidth size="small" type="number" label="Density" value={line.density}
                                      onChange={(e) => updateLine(idx, { density: e.target.value })} />
                                  </Grid>
                                </Grid>
                              </Box>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Typography variant="caption" color="text.secondary" display="block" mt={1.5}>
            A Purchase Bill debits Purchase Account + Input GST and credits the supplier. A
            Purchase Order is a draft only - no stock or ledger effect until it becomes a real bill.
          </Typography>
        </DialogContent>

        {/* --- Footer: summary left, actions right --- */}
        <DialogActions sx={{ px: 2, py: 1.25, gap: 1 }}>
          <Box sx={{ mr: "auto", display: "flex", alignItems: "baseline", gap: 2, flexWrap: "wrap" }}>
            <Typography variant="body2" color="text.secondary">Subtotal ₹{Math.round(subTotal).toLocaleString("en-IN")}</Typography>
            <Typography variant="body2" color="text.secondary">GST ₹{gstTotal.toLocaleString("en-IN")}</Typography>
            <Typography variant="h6" fontWeight={700} sx={{ color: T.greenDark }}>Total ₹{grandTotal.toLocaleString("en-IN")}</Typography>
          </Box>
          <Button size="small" color="inherit" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" disableElevation disabled={saving || !canSave} onClick={() => setConfirmSaveOpen(true)} sx={{ px: 3 }}>
            {saving ? "Saving..." : "Save Bill"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancel Purchase Bill?"
        message={`This reverses stock and every ledger posting for "${cancelTarget?.billNumber}". This cannot be undone.`}
        loading={cancelling}
        onConfirm={handleCancel}
        onCancel={() => setCancelTarget(null)}
      />

      {/* ---------- Make payment ---------- */}
      <Dialog open={!!payTarget} onClose={() => setPayTarget(null)} maxWidth="sm" fullWidth>
        <DialogHeader
          title={`Make Payment - ${payTarget?.supplier.name ?? ""}`}
          subtitle="Posts a Payment voucher immediately."
          onClose={() => setPayTarget(null)}
        />
        <DialogContent sx={{ pt: 2.5 }}>
          <Grid container spacing={1.5} mb={2} mt={0}>
            <Grid item xs={6} sm={4}>
              <TextField fullWidth size="small" type="number" label="Amount" value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
            </Grid>
            <Grid item xs={6} sm={4}>
              <TextField select fullWidth size="small" label="Payment Mode" value={payForm.paymentMode}
                onChange={(e) => {
                  const paymentMode = e.target.value;
                  const cashLedger = settlementAccounts.find((a) => a.accountGroup?.name === "Cash");
                  setPayForm((f) => ({ ...f, paymentMode, settlementLedger: paymentMode === "cash" && cashLedger ? cashLedger._id : f.settlementLedger }));
                }}>
                {PAYMENT_MODES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth size="small" label="Reference No." value={payForm.referenceNumber}
                onChange={(e) => setPayForm({ ...payForm, referenceNumber: e.target.value })} />
            </Grid>
            <Grid item xs={12}>
              <TextField select required fullWidth size="small" label="Paid From Account / Ledger" value={payForm.settlementLedger}
                onChange={(e) => setPayForm({ ...payForm, settlementLedger: e.target.value })}
                helperText="The exact Cash/Bank ledger this is actually going out of - from the Chart of Accounts">
                {settlementAccounts.map((a) => (
                  <MenuItem key={a._id} value={a._id}>{a.name}</MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>

          {payForm.paymentMode !== "cash" && (() => {
            const supplierLedger = suppliers.find((s) => s._id === payTarget?.supplier._id);
            return supplierLedger && (supplierLedger.bankAccountNumber || supplierLedger.bankIfscCode) ? (
              <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: T.greenLight, borderColor: T.border }}>
                <Typography variant="caption" color="text.secondary" display="block" fontWeight={600}>
                  {payTarget?.supplier.name}&apos;s registered bank account - send money here
                </Typography>
                <Typography variant="body2">
                  {supplierLedger.bankAccountHolderName || "-"} · {supplierLedger.bankName || "-"} · A/c {supplierLedger.bankAccountNumber || "-"} · IFSC {supplierLedger.bankIfscCode || "-"}
                </Typography>
              </Paper>
            ) : (
              <Typography variant="caption" color="warning.main" display="block" mb={2}>
                No bank account on file for {payTarget?.supplier.name} - add it under Ledger Master before paying by bank transfer.
              </Typography>
            );
          })()}

          <Typography sx={sectionLabelSx} mb={0.75}>Allocate against bill(s) - optional</Typography>
          <Paper variant="outlined" sx={cardSx}>
            <TableContainer>
              <Table size="small" sx={tableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell>Bill</TableCell>
                    <TableCell align="right">Bill Amount</TableCell>
                    <TableCell align="right">Already Paid</TableCell>
                    <TableCell align="right">Outstanding</TableCell>
                    <TableCell align="right">Allocate</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {payOpenBills.map((b) => {
                    const otherTotal = payAllocTotal - (Number(payAlloc[b.purchaseBill]) || 0);
                    const cap = Math.max(0, Math.min(b.outstandingAmount, Number(payForm.amount || 0) - otherTotal));
                    return (
                      <TableRow key={b.purchaseBill}>
                        <TableCell>{b.billNumber}</TableCell>
                        <TableCell align="right">₹{b.totalAmount.toLocaleString("en-IN")}</TableCell>
                        <TableCell align="right">₹{b.allocatedAmount.toLocaleString("en-IN")}</TableCell>
                        <TableCell align="right">₹{b.outstandingAmount.toLocaleString("en-IN")}</TableCell>
                        <TableCell align="right">
                          <TextField size="small" type="number" sx={{ width: 110, "& .MuiInputBase-input": { py: 0.75 } }} inputProps={{ min: 0, max: cap }}
                            value={payAlloc[b.purchaseBill] || ""}
                            onChange={(e) => setPayAllocation(b.purchaseBill, e.target.value, cap)} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {payOpenBills.length === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3, color: "text.secondary" }}>No open bills for this supplier</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>
            Unallocated (on-account/advance): ₹{payUnallocated}
          </Typography>
        </DialogContent>
        <Divider />
        <DialogActions sx={{ px: 2, py: 1 }}>
          <Button size="small" color="inherit" onClick={() => setPayTarget(null)} disabled={paying}>Cancel</Button>
          <Button size="small" variant="contained" color="success" disableElevation disabled={paying || !payForm.amount || !payForm.settlementLedger} onClick={() => setConfirmPayOpen(true)}>
            {paying ? "Posting..." : "Make Payment"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---------- Payment history ---------- */}
      <Dialog open={!!historyTarget} onClose={() => setHistoryTarget(null)} maxWidth="sm" fullWidth>
        <DialogHeader title={`Payment History - ${historyTarget?.billNumber ?? ""}`} onClose={() => setHistoryTarget(null)} />
        <DialogContent sx={{ pt: 2 }}>
          <Paper variant="outlined" sx={{ ...cardSx, mt: 1 }}>
            <TableContainer>
              <Table size="small" sx={tableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Voucher No</TableCell>
                    <TableCell>Account</TableCell>
                    <TableCell>Mode</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell align="right">Receipt</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paymentHistory.map((p) => (
                    <TableRow key={p._id} hover>
                      <TableCell>{new Date(p.date).toLocaleDateString("en-IN")}</TableCell>
                      <TableCell>{p.voucherNumber}</TableCell>
                      <TableCell>{p.account}</TableCell>
                      <TableCell sx={{ textTransform: "capitalize" }}>{p.paymentMode?.replace("_", " ") || "-"}</TableCell>
                      <TableCell align="right"><b>₹{p.amount.toLocaleString("en-IN")}</b></TableCell>
                      <TableCell align="right">
                        <Tooltip title="Print / Download Receipt">
                          <span>
                            <IconButton size="small" sx={{ ...iconBtnSx, color: T.green }} disabled={printingId === p._id} onClick={() => handlePrintReceipt(p._id)}>
                              <PrintOutlinedIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!historyLoading && paymentHistory.length === 0 && (
                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 3, color: "text.secondary" }}>No payments made against this bill yet</TableCell></TableRow>
                  )}
                  {historyLoading && (
                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 3 }}>Loading...</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1 }}>
          <Button size="small" color="success" onClick={() => setHistoryTarget(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={confirmSaveOpen}
        title="Save this Bill?"
        message={billType === "purchase_order"
          ? "This saves a draft Purchase Order - no stock or ledger effect yet, that happens only when it's confirmed into a real bill."
          : `This immediately posts stock and ledger entries worth ₹${grandTotal.toLocaleString("en-IN")} for ${suppliers.find((s) => s._id === supplier)?.name || "this supplier"}. This cannot be undone from here except by cancelling the bill afterwards.`}
        loading={saving}
        onConfirm={handleSave}
        onCancel={() => setConfirmSaveOpen(false)}
      />

      <ConfirmDialog
        open={!!confirmOrderTarget}
        title="Confirm Purchase Order into a Bill?"
        message={`This converts order "${confirmOrderTarget?.billNumber}" into a real bill and posts stock and ledger entries immediately. This cannot be undone from here except by cancelling the bill afterwards.`}
        loading={confirmingOrderId === confirmOrderTarget?._id}
        onConfirm={handleConfirmOrder}
        onCancel={() => setConfirmOrderTarget(null)}
      />

      <ConfirmDialog
        open={confirmPayOpen}
        title="Post this Payment?"
        message={`This immediately posts a Payment of ₹${payForm.amount || 0} to ${payTarget?.supplier.name} and updates the ledger balance.`}
        loading={paying}
        onConfirm={submitMakePayment}
        onCancel={() => setConfirmPayOpen(false)}
      />
    </>
  );
}