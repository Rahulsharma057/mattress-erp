"use client";

import { useEffect, useState } from "react";
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
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useSnackbar } from "@/components/SnackbarProvider";

interface Ledger {
  _id: string; name: string; creditLimit?: number; currentBalance?: number;
  accountGroup?: { name: string };
  bankAccountHolderName?: string; bankAccountNumber?: string; bankIfscCode?: string; bankName?: string;
}
interface Item { _id: string; name: string; unit: string; sgst: number; cgst: number; igst: number; stockQty?: number; }
interface ItemVariant { _id: string; sizeLabel: string; isUnspecified: boolean; availableQty: number; }
interface Line { item: string; variant: string; quantity: string; rate: string; sgst: number; cgst: number; igst: number; }
interface SalesBillRow {
  _id: string;
  billNumber: string;
  billType: string;
  date: string;
  party: { _id: string; name: string };
  totalAmount: number;
  status: string;
}
interface OpenInvoice { salesBill: string; billNumber: string; totalAmount: number; allocatedAmount: number; outstandingAmount: number; }
interface PaymentRecord { _id: string; voucherNumber: string; date: string; amount: number; paymentMode?: string; account: string; referenceNumber?: string; }

// Full item-wise Sales Bill detail, as returned by GET /sales/:id (with HSN nested-populated) -
// used only by the "View Invoice" dialog below. Distinct from SalesBillRow (the list row).
interface InvoiceLine {
  item?: { _id: string; name: string; unit: string; productCode?: string; hsn?: { code: string; shortName?: string } };
  variant?: { sizeLabel: string; isUnspecified?: boolean };
  quantity: number; rate: number; sgst: number; cgst: number; igst: number; amount: number;
}
interface SalesBillDetail {
  _id: string; billNumber: string; billType: string; date: string; status: string; totalAmount: number;
  party: { _id: string; name: string; address?: string; city?: string; state?: string; pincode?: string; gstin?: string; mobile?: string };
  items: InvoiceLine[];
}

// ---------- Theme tokens (Production / Item Master jaisi hi green theme) ----------
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

const PAYMENT_MODES = [
  { value: "cash", label: "Cash" }, { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" }, { value: "neft", label: "NEFT" },
  { value: "rtgs", label: "RTGS" }, { value: "cheque", label: "Cheque" }, { value: "other", label: "Other" },
];

const emptyLine: Line = { item: "", variant: "", quantity: "1", rate: "0", sgst: 0, cgst: 0, igst: 0 };
const CREDIT_OVERRIDE_ROLES = ["super_admin", "admin", "accountant"];

const statusStyle: Record<string, { bg: string; fg: string }> = {
  draft: { bg: T.greyLight, fg: T.grey },
  confirmed: { bg: T.greenLight, fg: T.green },
  modified: { bg: T.amberLight, fg: T.amber },
  cancelled: { bg: T.redLight, fg: T.red },
};
const billTypeLabel: Record<string, string> = {
  sales_bill: "Sales Bill (Credit)", cash_sale: "Cash Sale", sale_order: "Sale Order (Draft)",
};

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

export default function SalesPage() {
  const { user } = useAuthStore();
  const { showMessage } = useSnackbar();
  const [parties, setParties] = useState<Ledger[]>([]);
  const [allLedgers, setAllLedgers] = useState<Ledger[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [bills, setBills] = useState<SalesBillRow[]>([]);
  const [billsTotal, setBillsTotal] = useState(0);
  const [billsPage, setBillsPage] = useState(0); // MUI TablePagination is 0-indexed
  const [billsRowsPerPage, setBillsRowsPerPage] = useState(10);
  const [billsSearchInput, setBillsSearchInput] = useState("");
  const [billsSearch, setBillsSearch] = useState("");
  // Debounced (300ms) so typing doesn't fire a backend request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setBillsSearch(billsSearchInput), 300);
    return () => clearTimeout(t);
  }, [billsSearchInput]);
  useEffect(() => { setBillsPage(0); }, [billsSearch]); // a new search always starts from page 1
  const [party, setParty] = useState("");
  const [billType, setBillType] = useState("sales_bill");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<SalesBillRow | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);
  const [confirmOrderTarget, setConfirmOrderTarget] = useState<SalesBillRow | null>(null);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [confirmReceiveOpen, setConfirmReceiveOpen] = useState(false);

  // Credit-limit override prompt, shown only when the backend rejects a bill as exceeding
  // the dealer's available credit AND this user is authorized to override it.
  const [overridePrompt, setOverridePrompt] = useState<{ message: string } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  // Receive Payment dialog - direct accountant-entered receipt against a dealer's open
  // invoices (separate from the salesman Visit/Collection pending-approval flow, since this
  // is already accountant-initiated and posts immediately).
  const [receiveTarget, setReceiveTarget] = useState<SalesBillRow | null>(null);
  const [receiveOpenInvoices, setReceiveOpenInvoices] = useState<OpenInvoice[]>([]);
  const [receiveForm, setReceiveForm] = useState({ amount: "", paymentMode: "cash", referenceNumber: "", narration: "", settlementLedger: "" });
  const [receiveAlloc, setReceiveAlloc] = useState<Record<string, string>>({});
  const [receiving, setReceiving] = useState(false);

  // Payment History - every Receipt voucher allocated against a specific invoice, with a
  // printable receipt per payment (see backend getSalesBillPayments / getVoucherReceipt).
  const [historyTarget, setHistoryTarget] = useState<SalesBillRow | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [printingId, setPrintingId] = useState<string | null>(null);

  const openPaymentHistory = async (bill: SalesBillRow) => {
    setHistoryTarget(bill);
    setHistoryLoading(true);
    try {
      const res = await api.get(`/sales/${bill._id}/payments`);
      setPaymentHistory(res.data);
    } finally {
      setHistoryLoading(false);
    }
  };

  // ---------- View Invoice: the Sales Bill itself (items, HSN, GST, totals) ----------
  // Distinct from Payment History/Receipt above, which only ever show payment info, never
  // which products were sold. Always reads the real SalesBill + its actual posted Receipt
  // vouchers (/sales/:id and /sales/:id/payments) - never fabricates a line item or amount.
  const [viewInvoiceTarget, setViewInvoiceTarget] = useState<SalesBillRow | null>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<SalesBillDetail | null>(null);
  const [invoicePaid, setInvoicePaid] = useState(0);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceDownloading, setInvoiceDownloading] = useState(false);

  const openViewInvoice = async (bill: SalesBillRow) => {
    setViewInvoiceTarget(bill);
    setInvoiceDetail(null);
    setInvoiceLoading(true);
    try {
      const [billRes, paymentsRes] = await Promise.all([
        api.get(`/sales/${bill._id}`),
        api.get(`/sales/${bill._id}/payments`),
      ]);
      setInvoiceDetail(billRes.data);
      setInvoicePaid((paymentsRes.data as PaymentRecord[]).reduce((sum, p) => sum + p.amount, 0));
    } finally {
      setInvoiceLoading(false);
    }
  };

  // Fetched as a blob (not a plain <a href>) for the same reason as handlePrintReceipt above -
  // the API needs the Bearer token, which only axios's interceptor attaches. Read-only: this
  // generates the PDF on the fly from the already-saved bill, it never creates/modifies one.
  const handleDownloadInvoice = async (billId: string) => {
    setInvoiceDownloading(true);
    try {
      const res = await api.get(`/sales/${billId}/invoice`, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      window.open(blobUrl, "_blank");
    } finally {
      setInvoiceDownloading(false);
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
    // failing request (e.g. a transient network blip on the ledgers call) wipe out data that
    // DID load successfully, since none of the setters would run at all. That's what made
    // the Recent Bills table appear to "disappear" - a failed ledgers fetch was silently
    // discarding an otherwise-successful bills fetch in the same batch.
    const [partyRes, allLedgerRes, itemRes, billRes] = await Promise.allSettled([
      // Only real dealers - previously this had no entityType filter at all, so every
      // ledger (Cash Account, Sales Account, GST ledgers...) showed up as if it were a
      // customer you could raise a Sales Bill against.
      api.get("/masters/ledgers", { params: { entityType: "dealer" } }),
      api.get("/masters/ledgers"),
      api.get("/masters/items"),
      api.get("/sales", { params: {
        page: billsPage + 1, limit: billsRowsPerPage,
        search: billsSearch || undefined,
      } }),
    ]);
    if (partyRes.status === "fulfilled") setParties(partyRes.value.data);
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

  // Per-item cache of available specifications (see models/ItemVariant.js) - fetched once
  // per item, reused across lines/re-renders instead of refetching on every keystroke.
  const [itemVariants, setItemVariants] = useState<Record<string, ItemVariant[]>>({});
  const loadVariantsFor = async (itemId: string) => {
    if (!itemId || itemVariants[itemId]) return;
    const res = await api.get(`/masters/items/${itemId}/variants`);
    setItemVariants((prev) => ({ ...prev, [itemId]: res.data }));
  };

  // When an item is picked, auto-fill its GST %s from the Item master, clear any previously
  // selected size (it belonged to the old item), and fetch this item's available sizes.
  const handleItemSelect = (idx: number, itemId: string) => {
    const selected = items.find((it) => it._id === itemId);
    updateLine(idx, { item: itemId, variant: "", sgst: selected?.sgst || 0, cgst: selected?.cgst || 0, igst: selected?.igst || 0 });
    loadVariantsFor(itemId);
  };

  const addLine = () => setLines((prev) => [...prev, { ...emptyLine }]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  // igst = sgst + cgst by design (see backend HsnSac model) - they're alternatives for the
  // SAME total rate (CGST+SGST intra-state, or IGST inter-state), never added together. The
  // backend decides which actually gets posted (see utils/gstSplit); this preview just needs
  // the correct total, so it uses whichever one is populated, not the sum of all three.
  const gstPercent = (l: Line) => (l.igst > 0 ? l.igst : (l.sgst || 0) + (l.cgst || 0));
  const lineAmount = (l: Line) => {
    const base = Number(l.quantity) * Number(l.rate);
    const tax = (base * gstPercent(l)) / 100;
    return Math.round(base + tax);
  };
  const grandTotal = lines.reduce((sum, l) => sum + lineAmount(l), 0);
  const subTotal = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0);
  const gstTotal = Math.max(0, grandTotal - Math.round(subTotal));

  const selectedParty = parties.find((p) => p._id === party);
  const availableCredit = selectedParty?.creditLimit ? selectedParty.creditLimit - (selectedParty.currentBalance || 0) : undefined;

  const resetForm = () => {
    setParty(""); setBillType("sales_bill"); setPaymentMode("cash");
    setLines([{ ...emptyLine }]); setOverridePrompt(null); setOverrideReason("");
  };

  const submit = async (overrideCreditLimit?: boolean) => {
    setConfirmSaveOpen(false);
    setSaving(true);
    try {
      await api.post("/sales", {
        party, billType,
        paymentMode: billType === "cash_sale" ? paymentMode : undefined,
        items: lines.map((l) => ({
          item: l.item, variant: l.variant, quantity: Number(l.quantity), rate: Number(l.rate),
          sgst: l.sgst, cgst: l.cgst, igst: l.igst,
        })),
        overrideCreditLimit,
        overrideReason: overrideCreditLimit ? overrideReason : undefined,
      });
      showMessage("Sales bill saved", "success");
      resetForm();
      setCreateOpen(false);
      await loadData();
    } catch (err: any) {
      if (err?.response?.status === 409 && CREDIT_OVERRIDE_ROLES.includes(user?.role || "")) {
        setOverridePrompt({ message: err.response.data?.message || "Credit limit exceeded" });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await api.put(`/sales/${cancelTarget._id}/cancel`);
      showMessage("Sales bill cancelled, stock and ledger postings reversed", "success");
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
      await api.put(`/sales/${confirmOrderTarget._id}/confirm`, {});
      showMessage("Sale order confirmed into a bill - stock and ledger posted", "success");
      setConfirmOrderTarget(null);
      await loadData();
    } finally {
      setConfirmingOrderId(null);
    }
  };

  const openReceivePayment = async (bill: SalesBillRow) => {
    setReceiveTarget(bill);
    const cashLedger = settlementAccounts.find((a) => a.accountGroup?.name === "Cash");
    setReceiveForm({ amount: "", paymentMode: "cash", referenceNumber: "", narration: "", settlementLedger: cashLedger?._id || "" });
    const res = await api.get(`/masters/ledgers/${bill.party._id}/open-invoices`);
    setReceiveOpenInvoices(res.data);
    // Default: allocate this invoice's own outstanding, if it still has any.
    const thisInvoice = res.data.find((i: OpenInvoice) => i.salesBill === bill._id);
    if (thisInvoice) {
      setReceiveAlloc({ [bill._id]: String(thisInvoice.outstandingAmount) });
      setReceiveForm((f) => ({ ...f, amount: String(thisInvoice.outstandingAmount) }));
    } else {
      setReceiveAlloc({});
    }
  };

  const receiveAllocTotal = Object.values(receiveAlloc).reduce((t, v) => t + (Number(v) || 0), 0);
  const receiveUnallocated = Math.max(0, Number(receiveForm.amount || 0) - receiveAllocTotal);

  const setReceiveAllocation = (salesBill: string, value: string, cap: number) => {
    const num = Number(value);
    const clamped = Number.isFinite(num) ? Math.max(0, Math.min(num, cap)) : 0;
    setReceiveAlloc({ ...receiveAlloc, [salesBill]: value === "" ? "" : String(clamped) });
  };

  const submitReceivePayment = async () => {
    if (!receiveTarget) return;
    setConfirmReceiveOpen(false);
    setReceiving(true);
    try {
      const allocations = Object.entries(receiveAlloc)
        .map(([salesBill, amt]) => ({ salesBill, amount: Number(amt || 0) }))
        .filter((a) => a.amount > 0);
      await api.post("/accounts/receive-payment", {
        party: receiveTarget.party._id,
        amount: Number(receiveForm.amount || 0),
        paymentMode: receiveForm.paymentMode,
        referenceNumber: receiveForm.referenceNumber || undefined,
        narration: receiveForm.narration || undefined,
        settlementLedger: receiveForm.settlementLedger || undefined,
        allocations,
      });
      showMessage("Payment received and posted", "success");
      setReceiveTarget(null);
      await loadData();
    } finally {
      setReceiving(false);
    }
  };

  const canSave = party && lines.every((l) => l.item && l.variant && Number(l.quantity) > 0);
  const canCancel = user?.role === "super_admin" || user?.role === "admin";

  // Derived Sales Invoice summary - computed from the real line items (same qty*rate +
  // sgst/cgst/igst formula as backend utils/billCalc.computeLineAmounts), never re-fetched
  // separately so it can never drift from what the PDF shows.
  const invoiceSubtotal = invoiceDetail ? invoiceDetail.items.reduce((s, l) => s + l.quantity * l.rate, 0) : 0;
  const invoiceTax = invoiceDetail ? invoiceDetail.items.reduce((s, l) => s + (l.amount - l.quantity * l.rate), 0) : 0;
  const invoiceBalanceDue = invoiceDetail ? invoiceDetail.totalAmount - invoicePaid : 0;
  const invoicePaymentStatus = invoiceBalanceDue <= 0.01 ? "PAID" : invoicePaid > 0 ? "PARTIALLY PAID" : "UNPAID";

  return (
    <>
      {/* ---------- Page header ---------- */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5} gap={2} flexWrap="wrap">
        <Box display="flex" alignItems="center" gap={1.25}>
          <ReceiptLongIcon sx={{ fontSize: 34, color: T.greenDark }} />
          <Box>
            <Typography variant="h6" fontWeight={700} lineHeight={1.2} sx={{ color: T.ink }}>Sales</Typography>
            <Typography variant="caption" color="text.secondary">Recent bills, receive payments and view payment history.</Typography>
          </Box>
        </Box>
        <Button variant="contained" disableElevation startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}
          sx={{ bgcolor: T.greenDark, "&:hover": { bgcolor: T.greenHover }, fontWeight: 700, px: 2.5, height: 36, borderRadius: 1.5 }}>
          New Sale Bill
        </Button>
      </Box>

      {/* ---------- Recent bills table ---------- */}
      <Paper variant="outlined" sx={cardSx}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: T.rowBorder, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
          <Typography fontWeight={700} sx={{ color: T.ink }}>Recent Bills</Typography>
          <Box display="flex" alignItems="center" gap={1.5}>
            <TextField
              size="small" placeholder="Search bill no. or party..." value={billsSearchInput}
              onChange={(e) => setBillsSearchInput(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
              sx={{ width: 220, "& .MuiOutlinedInput-root": { height: 32, fontSize: 13 } }}
            />
            <Typography variant="body2" color="text.secondary">{billsTotal} bill{billsTotal === 1 ? "" : "s"}</Typography>
          </Box>
        </Box>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ ...tableSx, minWidth: 860 }}>
            <TableHead>
              <TableRow>
                <TableCell>Bill No</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Party</TableCell>
                <TableCell>Date</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bills.map((b) => {
                const st = statusStyle[b.status] ?? statusStyle.draft;
                return (
                  <TableRow key={b._id} hover sx={{ height: 42 }}>
                    <TableCell><Typography variant="body2" fontWeight={700} noWrap sx={{ color: T.greenDark }}>{b.billNumber}</Typography></TableCell>
                    <TableCell><Chip size="small" label={billTypeLabel[b.billType] || b.billType} sx={{ ...pillSx, bgcolor: T.greyLight, color: T.grey }} /></TableCell>
                    <TableCell><Typography variant="body2" fontWeight={600} noWrap>{b.party?.name}</Typography></TableCell>
                    <TableCell>{new Date(b.date).toLocaleDateString("en-IN")}</TableCell>
                    <TableCell align="right"><b>₹{b.totalAmount.toLocaleString("en-IN")}</b></TableCell>
                    <TableCell><Chip size="small" label={b.status} sx={{ ...pillSx, bgcolor: st.bg, color: st.fg, textTransform: "capitalize" }} /></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Box display="flex" gap={0.25} justifyContent="flex-end">
                        {b.billType === "sale_order" && (
                          <Tooltip title="Confirm into a real bill (posts stock and ledger)">
                            <span>
                              <IconButton size="small" sx={{ ...iconBtnSx, color: T.green }} disabled={confirmingOrderId === b._id} onClick={() => setConfirmOrderTarget(b)}>
                                <CheckCircleOutlineIcon sx={{ fontSize: 18 }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                        {b.billType === "sales_bill" && b.status !== "cancelled" && (
                          <Tooltip title="Receive Payment">
                            <IconButton size="small" sx={{ ...iconBtnSx, color: T.green }} onClick={() => openReceivePayment(b)}><PaymentsOutlinedIcon sx={{ fontSize: 18 }} /></IconButton>
                          </Tooltip>
                        )}
                        {b.billType === "sales_bill" && (
                          <Tooltip title="Payment History">
                            <IconButton size="small" sx={iconBtnSx} onClick={() => openPaymentHistory(b)}><HistoryIcon sx={{ fontSize: 18 }} /></IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="View Invoice (items, HSN, GST, totals)">
                          <IconButton size="small" sx={{ ...iconBtnSx, color: T.greenDark }} onClick={() => openViewInvoice(b)}>
                            <VisibilityOutlinedIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
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
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: "text.secondary" }}>No sales bills yet - 'New Sale Bill' se pehla banao</TableCell></TableRow>
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

      {/* ---------- New Sale Bill dialog ---------- */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="lg" fullWidth scroll="paper">
        <DialogHeader title="New Sale Bill" subtitle="Pick the party and add items - stock and ledger post when you save." onClose={() => setCreateOpen(false)} />
        <DialogContent dividers sx={{ bgcolor: "#f6faf6", px: 2, py: 2 }}>
          {/* --- Bill details --- */}
          <Paper variant="outlined" sx={{ ...cardSx, p: 2, mb: 2, overflow: "visible" }}>
            <Typography sx={sectionLabelSx} mb={1.25}>Bill Details</Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={billType === "cash_sale" ? 4 : 6}>
                <TextField select fullWidth size="small" label="Party" value={party} onChange={(e) => setParty(e.target.value)}>
                  {parties.map((p) => <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={billType === "cash_sale" ? 4 : 6}>
                <TextField select fullWidth size="small" label="Bill Type" value={billType} onChange={(e) => setBillType(e.target.value)}>
                  <MenuItem value="sales_bill">Sales Bill (Credit)</MenuItem>
                  <MenuItem value="cash_sale">Cash Sale</MenuItem>
                  <MenuItem value="sale_order">Sale Order (Draft)</MenuItem>
                </TextField>
              </Grid>
              {billType === "cash_sale" && (
                <Grid item xs={12} sm={4}>
                  <TextField select fullWidth size="small" label="Settled Via" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                    <MenuItem value="cash">Cash</MenuItem>
                    <MenuItem value="bank">Bank</MenuItem>
                  </TextField>
                </Grid>
              )}
            </Grid>
            {billType === "sales_bill" && selectedParty?.creditLimit ? (
              <Box mt={1.5} display="flex" gap={1} flexWrap="wrap">
                <Chip size="small" label={`Credit Limit ₹${selectedParty.creditLimit.toLocaleString("en-IN")}`} sx={{ ...pillSx, bgcolor: T.greyLight, color: T.grey }} />
                <Chip size="small"
                  label={`Available ₹${(availableCredit || 0).toLocaleString("en-IN")}`}
                  sx={{ ...pillSx, ...(availableCredit !== undefined && availableCredit < grandTotal ? { bgcolor: T.redLight, color: T.red } : { bgcolor: T.greenLight, color: T.green }) }} />
              </Box>
            ) : null}
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
                    <TableCell sx={{ width: "26%" }}>Size / Specification</TableCell>
                    <TableCell sx={{ width: 90 }}>Qty</TableCell>
                    <TableCell sx={{ width: 105 }}>Rate</TableCell>
                    <TableCell sx={{ width: 72 }} align="center">GST</TableCell>
                    <TableCell sx={{ width: 110 }} align="right">Amount</TableCell>
                    <TableCell sx={{ width: 44 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lines.map((line, idx) => {
                    // Only sizes that actually have stock - selling a known-zero specification would
                    // never pass the backend check anyway, so there's no point offering it (see
                    // salesBillController.createSalesBill, which validates the SELECTED variant's own
                    // stock, never the item's combined total).
                    const availableVariants = (itemVariants[line.item] || []).filter((v) => v.availableQty > 0);
                    const selectedVariant = availableVariants.find((v) => v._id === line.variant);
                    const overStock = selectedVariant && Number(line.quantity) > selectedVariant.availableQty;
                    return (
                      <TableRow key={idx}>
                        <TableCell align="center" sx={{ pt: 1.5, color: "text.secondary", fontWeight: 600 }}>{idx + 1}</TableCell>
                        <TableCell>
                          <TextField select fullWidth size="small" placeholder="Select item" value={line.item}
                            SelectProps={{ displayEmpty: true, renderValue: (v) => { const it = items.find((i) => i._id === v); return it ? `${it.name} (${it.unit})` : <span style={{ color: "#9aa5a0" }}>Select item</span>; } }}
                            onChange={(e) => handleItemSelect(idx, e.target.value)}>
                            {items.map((it) => <MenuItem key={it._id} value={it._id}>{it.name} ({it.unit})</MenuItem>)}
                          </TextField>
                        </TableCell>
                        <TableCell>
                          <TextField select fullWidth size="small" value={line.variant} disabled={!line.item}
                            SelectProps={{ displayEmpty: true, renderValue: (v) => { const sv = availableVariants.find((x) => x._id === v); return sv ? sv.sizeLabel : <span style={{ color: "#9aa5a0" }}>Select size</span>; } }}
                            onChange={(e) => updateLine(idx, { variant: e.target.value })}>
                            {availableVariants.map((v) => (
                              <MenuItem key={v._id} value={v._id}>{v.sizeLabel} (Avail: {v.availableQty})</MenuItem>
                            ))}
                          </TextField>
                          {selectedVariant && (
                            <Typography variant="caption" display="block" mt={0.25} sx={{ color: overStock ? T.red : "text.secondary", fontWeight: overStock ? 700 : 400 }}>
                              {overStock ? `Exceeds stock - only ${selectedVariant.availableQty} available` : `Available: ${selectedVariant.availableQty}`}
                            </Typography>
                          )}
                          {line.item && availableVariants.length === 0 && itemVariants[line.item] && (
                            <Typography variant="caption" display="block" mt={0.25} sx={{ color: T.red }}>No stock in any size</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <TextField fullWidth size="small" type="number" value={line.quantity} error={!!overStock}
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
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Typography variant="caption" color="text.secondary" display="block" mt={1.5}>
            A Sales Bill (Credit) debits the dealer and credits Sales Account + Output GST. A Cash
            Sale instead debits Cash/Bank, leaving the dealer&apos;s outstanding untouched. A Sale
            Order is a draft only - no stock or ledger effect until it becomes a real bill.
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

      {/* ---------- Credit limit override ---------- */}
      <Dialog open={!!overridePrompt} onClose={() => setOverridePrompt(null)} maxWidth="xs" fullWidth>
        <DialogHeader title="Credit Limit Exceeded" onClose={() => setOverridePrompt(null)} />
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" mb={2} mt={1}>{overridePrompt?.message}</Typography>
          <TextField
            fullWidth size="small" label="Override reason (required)" autoFocus
            value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1 }}>
          <Button size="small" color="inherit" onClick={() => setOverridePrompt(null)} disabled={saving}>Cancel</Button>
          <Button size="small" variant="contained" color="warning" disableElevation disabled={saving || !overrideReason} onClick={() => submit(true)}>
            {saving ? "Saving..." : "Override & Save Anyway"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancel Sales Bill?"
        message={`This reverses stock and every ledger posting for "${cancelTarget?.billNumber}". This cannot be undone.`}
        loading={cancelling}
        onConfirm={handleCancel}
        onCancel={() => setCancelTarget(null)}
      />

      {/* ---------- Receive payment ---------- */}
      <Dialog open={!!receiveTarget} onClose={() => setReceiveTarget(null)} maxWidth="sm" fullWidth>
        <DialogHeader
          title={`Receive Payment - ${receiveTarget?.party.name ?? ""}`}
          subtitle="Posts a Receipt voucher immediately, same as an approved collection."
          onClose={() => setReceiveTarget(null)}
        />
        <DialogContent sx={{ pt: 2.5 }}>
          <Grid container spacing={1.5} mb={2} mt={0}>
            <Grid item xs={6} sm={4}>
              <TextField fullWidth size="small" type="number" label="Amount" value={receiveForm.amount}
                onChange={(e) => setReceiveForm({ ...receiveForm, amount: e.target.value })} />
            </Grid>
            <Grid item xs={6} sm={4}>
              <TextField select fullWidth size="small" label="Payment Mode" value={receiveForm.paymentMode}
                onChange={(e) => {
                  const paymentMode = e.target.value;
                  // Cash mode defaults straight to the Cash ledger (there's normally only
                  // one), but the field stays visible and changeable either way - it's a
                  // convenience default, not a hidden auto-resolution.
                  const cashLedger = settlementAccounts.find((a) => a.accountGroup?.name === "Cash");
                  setReceiveForm((f) => ({ ...f, paymentMode, settlementLedger: paymentMode === "cash" && cashLedger ? cashLedger._id : f.settlementLedger }));
                }}>
                {PAYMENT_MODES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth size="small" label="Reference No." value={receiveForm.referenceNumber}
                onChange={(e) => setReceiveForm({ ...receiveForm, referenceNumber: e.target.value })} />
            </Grid>
            <Grid item xs={12}>
              <TextField select required fullWidth size="small" label="Received In Account / Ledger" value={receiveForm.settlementLedger}
                onChange={(e) => setReceiveForm({ ...receiveForm, settlementLedger: e.target.value })}
                helperText="The exact Cash/Bank ledger this money actually landed in - from the Chart of Accounts">
                {settlementAccounts.map((a) => (
                  <MenuItem key={a._id} value={a._id}>{a.name}</MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>

          {receiveForm.paymentMode !== "cash" && (() => {
            const partyLedger = parties.find((p) => p._id === receiveTarget?.party._id);
            return partyLedger && (partyLedger.bankAccountNumber || partyLedger.bankIfscCode) ? (
              <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: T.greenLight, borderColor: T.border }}>
                <Typography variant="caption" color="text.secondary" display="block" fontWeight={600}>
                  {receiveTarget?.party.name}&apos;s registered bank account (for your reference/verification)
                </Typography>
                <Typography variant="body2">
                  {partyLedger.bankAccountHolderName || "-"} · {partyLedger.bankName || "-"} · A/c {partyLedger.bankAccountNumber || "-"} · IFSC {partyLedger.bankIfscCode || "-"}
                </Typography>
              </Paper>
            ) : (
              <Typography variant="caption" color="warning.main" display="block" mb={2}>
                No bank account on file for {receiveTarget?.party.name} - add it under Ledger Master so bank-mode receipts can be verified.
              </Typography>
            );
          })()}

          <Typography sx={{ color: T.greenDark, fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }} mb={0.75}>
            Allocate against invoice(s) - optional
          </Typography>
          <Paper variant="outlined" sx={cardSx}>
            <TableContainer>
              <Table size="small" sx={tableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell>Invoice</TableCell>
                    <TableCell align="right">Invoice Amount</TableCell>
                    <TableCell align="right">Already Paid</TableCell>
                    <TableCell align="right">Outstanding</TableCell>
                    <TableCell align="right">Allocate</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {receiveOpenInvoices.map((inv) => {
                    const otherTotal = receiveAllocTotal - (Number(receiveAlloc[inv.salesBill]) || 0);
                    const cap = Math.max(0, Math.min(inv.outstandingAmount, Number(receiveForm.amount || 0) - otherTotal));
                    return (
                      <TableRow key={inv.salesBill}>
                        <TableCell>{inv.billNumber}</TableCell>
                        <TableCell align="right">₹{inv.totalAmount.toLocaleString("en-IN")}</TableCell>
                        <TableCell align="right">₹{inv.allocatedAmount.toLocaleString("en-IN")}</TableCell>
                        <TableCell align="right">₹{inv.outstandingAmount.toLocaleString("en-IN")}</TableCell>
                        <TableCell align="right">
                          <TextField size="small" type="number" sx={{ width: 110, "& .MuiInputBase-input": { py: 0.75 } }} inputProps={{ min: 0, max: cap }}
                            value={receiveAlloc[inv.salesBill] || ""}
                            onChange={(e) => setReceiveAllocation(inv.salesBill, e.target.value, cap)} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {receiveOpenInvoices.length === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3, color: "text.secondary" }}>No open invoices for this dealer</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>
            Unallocated (on-account/advance): ₹{receiveUnallocated}
          </Typography>
        </DialogContent>
        <Divider />
        <DialogActions sx={{ px: 2, py: 1 }}>
          <Button size="small" color="inherit" onClick={() => setReceiveTarget(null)} disabled={receiving}>Cancel</Button>
          <Button size="small" variant="contained" color="success" disableElevation disabled={receiving || !receiveForm.amount || !receiveForm.settlementLedger} onClick={() => setConfirmReceiveOpen(true)}>
            {receiving ? "Posting..." : "Receive Payment"}
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
                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 3, color: "text.secondary" }}>No payments received against this invoice yet</TableCell></TableRow>
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

      {/* ---------- View Invoice: real Sales Bill items/HSN/GST/totals, not just payment info ---------- */}
      <Dialog open={!!viewInvoiceTarget} onClose={() => setViewInvoiceTarget(null)} maxWidth="md" fullWidth>
        <DialogHeader
          title={`Sales Invoice - ${viewInvoiceTarget?.billNumber ?? ""}`}
          subtitle={viewInvoiceTarget ? billTypeLabel[viewInvoiceTarget.billType] || viewInvoiceTarget.billType : undefined}
          onClose={() => setViewInvoiceTarget(null)}
        />
        <DialogContent sx={{ pt: 2 }}>
          {invoiceLoading && <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>Loading invoice...</Typography>}
          {!invoiceLoading && invoiceDetail && (
            <>
              <Grid container spacing={2} mb={2}>
                <Grid item xs={12} sm={6}>
                  <Typography sx={sectionLabelSx} mb={0.5}>Invoice Details</Typography>
                  <Typography variant="body2">Invoice No: <b>{invoiceDetail.billNumber}</b></Typography>
                  <Typography variant="body2">Date: {new Date(invoiceDetail.date).toLocaleDateString("en-IN")}</Typography>
                  <Typography variant="body2" sx={{ textTransform: "capitalize" }}>Status: {invoiceDetail.status}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography sx={sectionLabelSx} mb={0.5}>Bill To</Typography>
                  <Typography variant="body2" fontWeight={700}>{invoiceDetail.party?.name}</Typography>
                  {invoiceDetail.party?.address && <Typography variant="body2">{invoiceDetail.party.address}</Typography>}
                  {(invoiceDetail.party?.city || invoiceDetail.party?.state || invoiceDetail.party?.pincode) && (
                    <Typography variant="body2">{[invoiceDetail.party.city, invoiceDetail.party.state, invoiceDetail.party.pincode].filter(Boolean).join(", ")}</Typography>
                  )}
                  {invoiceDetail.party?.gstin && <Typography variant="body2">GSTIN: {invoiceDetail.party.gstin}</Typography>}
                  {invoiceDetail.party?.mobile && <Typography variant="body2">Mobile: {invoiceDetail.party.mobile}</Typography>}
                </Grid>
              </Grid>

              <Paper variant="outlined" sx={cardSx}>
                <TableContainer>
                  <Table size="small" sx={tableSx}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Item</TableCell>
                        <TableCell>HSN</TableCell>
                        <TableCell align="right">Qty</TableCell>
                        <TableCell align="right">Rate</TableCell>
                        <TableCell align="right">Discount</TableCell>
                        <TableCell align="right">Taxable Amt</TableCell>
                        <TableCell align="right">GST</TableCell>
                        <TableCell align="right">Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {invoiceDetail.items.map((line, idx) => {
                        const base = line.quantity * line.rate;
                        const gstRate = (line.sgst || 0) + (line.cgst || 0) + (line.igst || 0);
                        const taxAmt = line.amount - base;
                        const sizeLabel = line.variant && !line.variant.isUnspecified ? ` (${line.variant.sizeLabel})` : "";
                        return (
                          <TableRow key={idx} hover>
                            <TableCell>
                              <Typography variant="body2" fontWeight={600}>{line.item?.name}{sizeLabel}</Typography>
                              {line.item?.productCode && <Typography variant="caption" color="text.secondary">{line.item.productCode}</Typography>}
                            </TableCell>
                            <TableCell>{line.item?.hsn?.code || "-"}</TableCell>
                            <TableCell align="right">{line.quantity} {line.item?.unit}</TableCell>
                            <TableCell align="right">₹{line.rate.toLocaleString("en-IN")}</TableCell>
                            <TableCell align="right">₹0</TableCell>
                            <TableCell align="right">₹{base.toLocaleString("en-IN")}</TableCell>
                            <TableCell align="right">{gstRate}% / ₹{taxAmt.toFixed(2)}</TableCell>
                            <TableCell align="right"><b>₹{line.amount.toLocaleString("en-IN")}</b></TableCell>
                          </TableRow>
                        );
                      })}
                      {invoiceDetail.items.length === 0 && (
                        <TableRow><TableCell colSpan={8} align="center" sx={{ py: 3, color: "text.secondary" }}>No items on this invoice</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>

              <Box display="flex" justifyContent="flex-end" mt={2}>
                <Box sx={{ width: { xs: "100%", sm: 320 } }}>
                  {[
                    ["Subtotal", `₹${invoiceSubtotal.toLocaleString("en-IN")}`],
                    ["Total Discount", "₹0"],
                    ["Taxable Amount", `₹${invoiceSubtotal.toLocaleString("en-IN")}`],
                    ["GST (CGST+SGST / IGST)", `₹${invoiceTax.toFixed(2)}`],
                  ].map(([label, value]) => (
                    <Box key={label} display="flex" justifyContent="space-between" py={0.25}>
                      <Typography variant="body2" color="text.secondary">{label}</Typography>
                      <Typography variant="body2">{value}</Typography>
                    </Box>
                  ))}
                  <Divider sx={{ my: 0.75 }} />
                  <Box display="flex" justifyContent="space-between" py={0.25}>
                    <Typography fontWeight={700}>Grand Total</Typography>
                    <Typography fontWeight={700}>₹{invoiceDetail.totalAmount.toLocaleString("en-IN")}</Typography>
                  </Box>
                  <Box display="flex" justifyContent="space-between" py={0.25}>
                    <Typography variant="body2" color="text.secondary">Amount Paid</Typography>
                    <Typography variant="body2">₹{invoicePaid.toLocaleString("en-IN")}</Typography>
                  </Box>
                  <Box display="flex" justifyContent="space-between" py={0.25}>
                    <Typography fontWeight={700} color={invoiceBalanceDue > 0.01 ? T.red : T.green}>Balance Due</Typography>
                    <Typography fontWeight={700} color={invoiceBalanceDue > 0.01 ? T.red : T.green}>₹{invoiceBalanceDue.toLocaleString("en-IN")}</Typography>
                  </Box>
                  <Box display="flex" justifyContent="flex-end" mt={0.5}>
                    <Chip size="small" label={invoicePaymentStatus} sx={{ ...pillSx, bgcolor: invoicePaymentStatus === "PAID" ? T.greenLight : invoicePaymentStatus === "UNPAID" ? T.redLight : T.amberLight, color: invoicePaymentStatus === "PAID" ? T.green : invoicePaymentStatus === "UNPAID" ? T.red : T.amber }} />
                  </Box>
                </Box>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1 }}>
          <Button size="small" color="inherit" onClick={() => setViewInvoiceTarget(null)}>Close</Button>
          <Button
            size="small" variant="contained" color="success" disableElevation startIcon={<PrintOutlinedIcon />}
            disabled={!invoiceDetail || invoiceDownloading}
            onClick={() => invoiceDetail && handleDownloadInvoice(invoiceDetail._id)}
          >
            {invoiceDownloading ? "Preparing..." : "Print / Download"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={confirmSaveOpen}
        title="Save this Bill?"
        message={billType === "sale_order"
          ? "This saves a draft Sale Order - no stock or ledger effect yet, that happens only when it's confirmed into a real bill."
          : `This immediately posts stock and ledger entries worth ₹${grandTotal.toLocaleString("en-IN")} for ${selectedParty?.name || "this party"}. This cannot be undone from here except by cancelling the bill afterwards.`}
        loading={saving}
        onConfirm={() => submit()}
        onCancel={() => setConfirmSaveOpen(false)}
      />

      <ConfirmDialog
        open={!!confirmOrderTarget}
        title="Confirm Sale Order into a Bill?"
        message={`This converts order "${confirmOrderTarget?.billNumber}" into a real bill and posts stock and ledger entries immediately. This cannot be undone from here except by cancelling the bill afterwards.`}
        loading={confirmingOrderId === confirmOrderTarget?._id}
        onConfirm={handleConfirmOrder}
        onCancel={() => setConfirmOrderTarget(null)}
      />

      <ConfirmDialog
        open={confirmReceiveOpen}
        title="Post this Receipt?"
        message={`This immediately posts a Receipt of ₹${receiveForm.amount || 0} from ${receiveTarget?.party.name} and updates the ledger balance.`}
        loading={receiving}
        onConfirm={submitReceivePayment}
        onCancel={() => setConfirmReceiveOpen(false)}
      />
    </>
  );
}