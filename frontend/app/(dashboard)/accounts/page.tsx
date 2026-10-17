"use client";

import { useEffect, useState } from "react";
import {
  Typography, Box, Grid, TextField, MenuItem, Button, Table, TableHead,
  TableRow, TableCell, TableBody, Paper, TableContainer, Chip, IconButton, Tooltip, Tabs, Tab,
  Alert, Collapse, LinearProgress, Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import PrintIcon from "@mui/icons-material/Print";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import RefreshIcon from "@mui/icons-material/Refresh";
import FilterAltOffIcon from "@mui/icons-material/FilterAltOff";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import api from "@/lib/api";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useSnackbar } from "@/components/SnackbarProvider";

interface Ledger { _id: string; name: string; currentBalance: number; dealerCode?: string; entityType?: string; }
interface Item { _id: string; name: string; unit: string; sgst: number; cgst: number; igst: number; stockQty?: number; }
interface VoucherRow {
  _id: string; voucherNumber: string; voucherType: string; date: string;
  ledger: { name: string }; counterLedger?: { name: string }; amount: number; drCr: string;
  source?: string; paymentMode?: string; referenceNumber?: string;
}

const SOURCE_INFO: Record<string, { label: string; color: "default" | "primary" | "secondary" }> = {
  manual: { label: "Manual (typed here)", color: "default" },
  direct_receipt: { label: "Receive Payment (Sales)", color: "primary" },
  direct_payment: { label: "Make Payment (Purchase)", color: "primary" },
  collection_approval: { label: "Salesman Collection (auto, on approval)", color: "secondary" },
  expense_approval: { label: "Expense Claim (auto, on approval)", color: "secondary" },
  credit_note: { label: "Credit Note", color: "default" },
  debit_note: { label: "Debit Note", color: "default" },
};
const sourceInfo = (s?: string) => SOURCE_INFO[s || "manual"] || SOURCE_INFO.manual;

const VOUCHER_TYPES = [
  { value: "receipt", label: "Receipt (money coming in)" }, { value: "payment", label: "Payment (money going out)" },
  { value: "contra", label: "Contra (Cash ↔ Bank)" }, { value: "journal", label: "Journal (any adjustment)" },
];

const ledgerLabel = (l: Ledger) =>
  `${l.name}${l.dealerCode ? ` (${l.dealerCode})` : ""}${l.entityType ? ` · ${l.entityType}` : ""} — ₹${l.currentBalance?.toLocaleString("en-IN") ?? 0}`;

const emptyNoteLine = { item: "", quantity: "1", rate: "0", sgst: 0, cgst: 0, igst: 0 };
const emptyVoucherForm = { voucherType: "receipt", debitAccount: "", creditAccount: "", amount: "", narration: "" };

// ---- UI constants ----
const GREEN = "#43a047";
const GREEN_DARK = "#2e7d32";
const GREEN_LIGHT = "#edf7ee";

// One clean, readable font for the whole page (falls back to the system UI font if Inter isn't loaded).
const FONT = `"Inter", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif`;
const fontSx = {
  fontFamily: FONT,
  "& .MuiTypography-root, & .MuiTableCell-root, & .MuiButton-root, & .MuiInputBase-root, & .MuiInputLabel-root, & .MuiFormHelperText-root, & .MuiChip-root, & .MuiTab-root, & .MuiMenuItem-root, & .MuiAlert-root, & .MuiDialogTitle-root": {
    fontFamily: FONT,
  },
  "& .MuiTypography-body2": { fontSize: 14, lineHeight: 1.5 },
  "& .MuiTypography-caption": { fontSize: 12.5, lineHeight: 1.5 },
  "& .MuiInputBase-input": { fontSize: 14 },
  "& .MuiInputLabel-root": { fontSize: 14 },
  "& .MuiMenuItem-root": { fontSize: 14 },
  WebkitFontSmoothing: "antialiased",
  "& .MuiOutlinedInput-root": { borderRadius: 1, bgcolor: "#fff", transition: "box-shadow .15s ease" },
  "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": { borderColor: GREEN },
  "& .MuiOutlinedInput-root.Mui-focused": { boxShadow: "0 0 0 3px rgba(46,125,50,0.15)" },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: GREEN, borderWidth: 1.5 },
  "& .MuiInputLabel-root.Mui-focused": { color: GREEN_DARK },
} as const;

const TYPE_STYLE: Record<string, { bg: string; fg: string }> = {
  receipt: { bg: "#e8f5e9", fg: "#2e7d32" },
  payment: { bg: "#ffebee", fg: "#d32f2f" },
  contra: { bg: "#e3f2fd", fg: "#1976d2" },
  journal: { bg: "#eceff1", fg: "#546e7a" },
  credit_note: { bg: "#f3e5f5", fg: "#7b1fa2" },
  debit_note: { bg: "#fff3e0", fg: "#ef6c00" },
};
const SOURCE_STYLE: Record<string, { bg: string; fg: string }> = {
  default: { bg: "#eceff1", fg: "#546e7a" },
  primary: { bg: "#e8f5e9", fg: "#2e7d32" },
  secondary: { bg: "#f3e5f5", fg: "#7b1fa2" },
};

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";

// Section headings: sentence case, semi-bold (no more shouty ALL CAPS)
const sectionLabelSx = { color: GREEN_DARK, fontWeight: 700, fontSize: 15, letterSpacing: 0.1 } as const;
const darkBtnSx = {
  bgcolor: GREEN_DARK, color: "#fff", fontWeight: 600, borderRadius: 1.5, textTransform: "none", fontSize: 14,
  background: `linear-gradient(180deg, ${GREEN} 0%, ${GREEN_DARK} 100%)`,
  boxShadow: "0 2px 6px rgba(46,125,50,0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
  transition: "box-shadow .15s ease, transform .15s ease",
  "&:hover": { background: `linear-gradient(180deg, #4caf50 0%, #256528 100%)`, boxShadow: "0 4px 12px rgba(46,125,50,0.45)", transform: "translateY(-1px)" },
  "&:active": { transform: "translateY(0)", boxShadow: "0 1px 3px rgba(46,125,50,0.4)" },
  "&.Mui-disabled": { background: "#cfd8d1", color: "#fff", boxShadow: "none" },
} as const;

// Soft card look used by every panel on the page
const CARD_SX = {
  borderRadius: 1.5, borderColor: "#e1e9e1",
  boxShadow: "0 1px 2px rgba(16,40,22,0.06), 0 6px 18px rgba(16,40,22,0.06)",
} as const;
const ICON_BTN_SX = {
  bgcolor: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)", border: 1, borderColor: "divider", borderRadius: 1,
  transition: "box-shadow .15s ease", "&:hover": { boxShadow: "0 2px 6px rgba(0,0,0,0.22)" },
} as const;

export default function AccountsPage() {
  const { showMessage } = useSnackbar();
  const [tab, setTab] = useState(0);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);

  const [form, setForm] = useState(emptyVoucherForm);
  const [voucherDialogOpen, setVoucherDialogOpen] = useState(false); // "Create Voucher" popup
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VoucherRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmVoucherOpen, setConfirmVoucherOpen] = useState(false);
  const [confirmNoteOpen, setConfirmNoteOpen] = useState(false);

  const [filters, setFilters] = useState({ voucherType: "", ledger: "", from: "", to: "" });

  const [loading, setLoading] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const openCreateVoucher = () => {
    setTab(0);
    setForm(emptyVoucherForm);
    setShowHelp(false);
    setVoucherDialogOpen(true);
  };
  const closeCreateVoucher = () => {
    if (saving) return;
    setVoucherDialogOpen(false);
  };

  const handleVoucherTypeChange = (voucherType: string) => {
    const cash = ledgers.find((l) => l.name === "Cash Account");
    const patch: Partial<typeof form> = { voucherType };
    if (voucherType === "receipt" && cash) patch.debitAccount = cash._id;
    if (voucherType === "payment" && cash) patch.creditAccount = cash._id;
    setForm({ ...form, ...patch });
  };

  // Credit/Debit note forms
  const [noteType, setNoteType] = useState<"credit" | "debit">("credit");
  const [noteParty, setNoteParty] = useState("");
  const [noteRemarks, setNoteRemarks] = useState("");
  const [noteLines, setNoteLines] = useState([{ ...emptyNoteLine }]);
  const [noteSaving, setNoteSaving] = useState(false);

  const loadData = async () => {
    const [ledgerRes, voucherRes, itemRes] = await Promise.allSettled([
      api.get("/masters/ledgers"),
      api.get("/accounts", { params: {
        voucherType: filters.voucherType || undefined,
        ledger: filters.ledger || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
      } }),
      api.get("/masters/items"),
    ]);
    if (ledgerRes.status === "fulfilled") setLedgers(ledgerRes.value.data);
    if (voucherRes.status === "fulfilled") setVouchers(voucherRes.value.data);
    if (itemRes.status === "fulfilled") setItems(itemRes.value.data);
  };

  useEffect(() => { setLoading(true); loadData().finally(() => setLoading(false)); }, [filters]);
  useEffect(() => { setPage(0); }, [filters, rowsPerPage]);

  const handleRefresh = async () => {
    setLoading(true);
    try { await loadData(); } finally { setLoading(false); }
  };

  const handleSaveVoucher = async () => {
    setConfirmVoucherOpen(false);
    setSaving(true);
    try {
      await api.post("/accounts", {
        voucherType: form.voucherType,
        ledger: form.debitAccount,
        drCr: "debit",
        counterLedger: form.creditAccount,
        amount: Number(form.amount),
        narration: form.narration,
      });
      showMessage("Voucher saved", "success");
      setForm(emptyVoucherForm);
      setVoucherDialogOpen(false); // close the popup once saved
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVoucher = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const path = deleteTarget.voucherType === "credit_note" ? `/accounts/credit-notes/${deleteTarget._id}`
        : deleteTarget.voucherType === "debit_note" ? `/accounts/debit-notes/${deleteTarget._id}`
        : `/accounts/${deleteTarget._id}`;
      await api.delete(path);
      showMessage("Voucher cancelled, ledger balance reversed", "success");
      setDeleteTarget(null);
      await loadData();
    } finally {
      setDeleting(false);
    }
  };

  const [printingId, setPrintingId] = useState<string | null>(null);
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

  const noteAddLine = () => setNoteLines((p) => [...p, { ...emptyNoteLine }]);
  const noteRemoveLine = (idx: number) => setNoteLines((p) => p.filter((_, i) => i !== idx));
  const noteUpdateLine = (idx: number, patch: Partial<typeof emptyNoteLine>) =>
    setNoteLines((p) => p.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const noteSelectItem = (idx: number, itemId: string) => {
    const selected = items.find((it) => it._id === itemId);
    noteUpdateLine(idx, { item: itemId, sgst: selected?.sgst || 0, cgst: selected?.cgst || 0, igst: selected?.igst || 0 });
  };

  const noteGstPercent = (l: typeof emptyNoteLine) => (l.igst > 0 ? l.igst : (l.sgst || 0) + (l.cgst || 0));
  const noteLineAmount = (l: typeof emptyNoteLine) => {
    const base = Number(l.quantity || 0) * Number(l.rate || 0);
    const tax = (base * noteGstPercent(l)) / 100;
    return Math.round(base + tax);
  };
  const noteTotal = noteLines.reduce((sum, l) => sum + noteLineAmount(l), 0);

  const handleSaveNote = async () => {
    setConfirmNoteOpen(false);
    setNoteSaving(true);
    try {
      const endpoint = noteType === "credit" ? "/accounts/credit-notes" : "/accounts/debit-notes";
      await api.post(endpoint, {
        party: noteParty,
        items: noteLines.map((l) => ({
          item: l.item, quantity: Number(l.quantity), rate: Number(l.rate),
          sgst: l.sgst, cgst: l.cgst, igst: l.igst,
        })),
        remarks: noteRemarks,
      });
      showMessage(`${noteType === "credit" ? "Credit" : "Debit"} note saved`, "success");
      setNoteParty(""); setNoteRemarks(""); setNoteLines([{ ...emptyNoteLine }]);
      await loadData();
    } finally {
      setNoteSaving(false);
    }
  };

  // ---- derived UI data ----
  const hasFilter = !!(filters.voucherType || filters.ledger || filters.from || filters.to);
  const pageRows = vouchers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const totalPages = Math.max(1, Math.ceil(vouchers.length / rowsPerPage));
  const pageStart = Math.max(0, Math.min(page - 1, totalPages - 3));
  const pageNumbers = Array.from({ length: Math.min(3, totalPages) }, (_, i) => pageStart + i);

  const voucherFormInvalid =
    !form.debitAccount || !form.creditAccount || form.debitAccount === form.creditAccount || !form.amount;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, ...fontSx }}>
      {/* ---------- Page header ---------- */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <Box sx={{ width: 52, height: 52, borderRadius: 1.5, display: "grid", placeItems: "center", color: "#fff",
            background: `linear-gradient(135deg, ${GREEN} 0%, ${GREEN_DARK} 100%)`, boxShadow: "0 4px 12px rgba(46,125,50,0.35)" }}>
            <AccountBalanceWalletIcon sx={{ fontSize: 28 }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700} lineHeight={1.2} letterSpacing={-0.2} sx={{ color: "#14281b" }}>Accounts</Typography>
            <Typography variant="body2" color="text.secondary">
              Post vouchers, track ledger entries and manage credit / debit notes.
            </Typography>
          </Box>
        </Box>
        <Box display="flex" alignItems="center" gap={1.5}>
          <Button variant="contained" disableElevation startIcon={<AddIcon />} onClick={openCreateVoucher}
            sx={{ ...darkBtnSx, height: 40, px: 2.5 }}>
            Create Voucher
          </Button>
          <Tooltip title="Refresh">
            <span>
              <IconButton aria-label="refresh" onClick={handleRefresh} disabled={loading}
                sx={{ ...ICON_BTN_SX, width: 40, height: 40, borderRadius: 1.5 }}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)}
        sx={{ borderBottom: 1, borderColor: "divider", minHeight: 42, "& .MuiTab-root": { minHeight: 42, fontWeight: 600, fontSize: 14, textTransform: "none" }, "& .MuiTabs-indicator": { bgcolor: GREEN_DARK, height: 3, borderRadius: "3px 3px 0 0" }, "& .Mui-selected": { color: `${GREEN_DARK} !important` } }}>
        <Tab label="Vouchers" />
        <Tab label="Credit / Debit Notes" />
      </Tabs>

      {/* =================== VOUCHERS TAB =================== */}
      {tab === 0 && (
        <>
          {/* ---------- Filter bar ---------- */}
          <Paper variant="outlined" sx={{ p: 2, ...CARD_SX, display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "flex-end" }}>
            <TextField select size="small" label="Type" value={filters.voucherType} sx={{ minWidth: 150 }}
              onChange={(e) => setFilters({ ...filters, voucherType: e.target.value })}>
              <MenuItem value="">All Types</MenuItem>
              {VOUCHER_TYPES.map((t) => <MenuItem key={t.value} value={t.value} sx={{ textTransform: "capitalize" }}>{t.value}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Account" value={filters.ledger} sx={{ minWidth: 190 }}
              onChange={(e) => setFilters({ ...filters, ledger: e.target.value })}>
              <MenuItem value="">All Accounts</MenuItem>
              {ledgers.map((l) => <MenuItem key={l._id} value={l._id}>{l.name}</MenuItem>)}
            </TextField>
            <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
            <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
            <Button variant="outlined" color="success" startIcon={<FilterAltOffIcon />} disabled={!hasFilter}
              onClick={() => setFilters({ voucherType: "", ledger: "", from: "", to: "" })}
              sx={{ height: 40, borderRadius: 1.5, fontWeight: 600, textTransform: "none", bgcolor: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
              Clear
            </Button>
            <Box flex={1} />
            <Typography variant="body2" color="text.secondary" sx={{ pb: 1 }}>
              {vouchers.length} voucher{vouchers.length === 1 ? "" : "s"}
            </Typography>
          </Paper>

          {/* ---------- Voucher table ---------- */}
          <Paper variant="outlined" sx={{ overflow: "hidden", ...CARD_SX, minWidth: 0, maxWidth: "100%" }}>
            {loading && <LinearProgress color="success" sx={{ height: 2 }} />}
            <TableContainer sx={{ overflowX: "auto", maxWidth: "100%" }}>
              <Table size="small" sx={{
                tableLayout: "fixed", minWidth: 1080,
                "& .MuiTableCell-root": { py: 0.5, px: 1.5, borderColor: "#edf1ed" },
                "& .MuiTableCell-head": {
                  bgcolor: GREEN_DARK, color: "#fff", fontWeight: 600, fontSize: 12.5,
                  whiteSpace: "nowrap", py: 1, borderColor: GREEN_DARK,
                },
                "& .MuiTableCell-body": { verticalAlign: "middle", fontSize: 13.5 },
                "& .MuiTableBody-root .MuiTypography-body2": { fontSize: 13.5 },
              }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 110 }}>Voucher No</TableCell>
                    <TableCell sx={{ width: 110 }}>Type</TableCell>
                    <TableCell>Debit Account</TableCell>
                    <TableCell>Credit Account</TableCell>
                    <TableCell sx={{ width: 175 }}>Source</TableCell>
                    <TableCell sx={{ width: 140 }}>Mode / Ref</TableCell>
                    <TableCell sx={{ width: 105 }}>Date</TableCell>
                    <TableCell align="right" sx={{ width: 120 }}>Amount</TableCell>
                    <TableCell align="right" sx={{ width: 90, position: "sticky", right: 0, zIndex: 3, bgcolor: "#256528", borderLeft: "1px solid #1e5421", boxShadow: "-8px 0 12px -6px rgba(0,0,0,0.4)" }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pageRows.map((v) => {
                    const [debitSide, creditSide] = v.drCr === "debit" ? [v.ledger, v.counterLedger] : [v.counterLedger, v.ledger];
                    const src = sourceInfo(v.source);
                    const srcStyle = SOURCE_STYLE[src.color];
                    const typeStyle = TYPE_STYLE[v.voucherType] || TYPE_STYLE.journal;
                    const canPrint = v.voucherType === "receipt" || v.voucherType === "payment";
                    return (
                      <TableRow key={v._id} hover sx={{ height: 38, "&.MuiTableRow-hover:hover": { bgcolor: "#f3f8f3" } }}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={700} noWrap sx={{ color: GREEN_DARK }}>{v.voucherNumber}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={v.voucherType.replace("_", " ")}
                            sx={{ bgcolor: typeStyle.bg, color: typeStyle.fg, fontWeight: 600, fontSize: 12, textTransform: "capitalize", height: 20 }} />
                        </TableCell>
                        <TableCell><Typography variant="body2" noWrap title={debitSide?.name}>{debitSide?.name || "-"}</Typography></TableCell>
                        <TableCell><Typography variant="body2" noWrap title={creditSide?.name}>{creditSide?.name || "-"}</Typography></TableCell>
                        <TableCell>
                          <Tooltip title={src.label} enterDelay={400}>
                            <Chip size="small" label={src.label}
                              sx={{ bgcolor: srcStyle.bg, color: srcStyle.fg, fontWeight: 600, fontSize: 12, height: 20, maxWidth: "100%" }} />
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          {v.paymentMode || v.referenceNumber ? (
                            <Typography variant="body2" noWrap
                              title={[v.paymentMode, v.referenceNumber].filter(Boolean).join(" · ")}
                              sx={{ textTransform: "capitalize" }}>
                              {v.paymentMode ? v.paymentMode.replace("_", " ") : "-"}
                              {v.referenceNumber && (
                                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75, textTransform: "none" }}>
                                  {v.referenceNumber}
                                </Typography>
                              )}
                            </Typography>
                          ) : (
                            <Typography variant="body2" color="text.secondary">-</Typography>
                          )}
                        </TableCell>
                        <TableCell><Typography variant="body2" color="text.secondary" noWrap>{fmtDate(v.date)}</Typography></TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700} noWrap sx={{ fontVariantNumeric: "tabular-nums" }}>₹{v.amount.toLocaleString("en-IN")}</Typography>
                        </TableCell>
                        <TableCell align="right" sx={{
                          position: "sticky", right: 0, zIndex: 2, bgcolor: "#eaf4eb",
                          borderLeft: "1px solid #d3e0d3",
                          boxShadow: "-8px 0 12px -6px rgba(16,40,22,0.28)",
                          "tr:hover &": { bgcolor: "#dcecdd" },
                        }}>
                          <Box display="flex" gap={0.5} justifyContent="flex-end">
                            <Tooltip title={canPrint ? "Print / Download Receipt" : "Receipt sirf Receipt/Payment voucher ka banta hai"}>
                              <span>
                                <IconButton size="small" aria-label="print receipt" disabled={!canPrint || printingId === v._id}
                                  onClick={() => handlePrintReceipt(v._id)}
                                  sx={{ ...ICON_BTN_SX, color: GREEN, borderColor: canPrint ? GREEN : "divider", p: 0.5, "&:hover": { bgcolor: GREEN_LIGHT, boxShadow: "0 2px 6px rgba(0,0,0,0.22)" } }}>
                                  <PrintIcon sx={{ fontSize: 17 }} />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Delete (reverses ledger balance)">
                              <IconButton size="small" aria-label="delete voucher" color="error" onClick={() => setDeleteTarget(v)}
                                sx={{ ...ICON_BTN_SX, borderColor: "error.main", p: 0.5, "&:hover": { bgcolor: "#ffebee", boxShadow: "0 2px 6px rgba(0,0,0,0.22)" } }}>
                                <DeleteIcon sx={{ fontSize: 17 }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {pageRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 6, color: "text.secondary" }}>
                        {loading ? "Loading vouchers..." : hasFilter ? "Koi voucher match nahi hua" : (
                          <Box display="flex" flexDirection="column" alignItems="center" gap={1.5}>
                            <span>No vouchers yet</span>
                            <Button variant="contained" disableElevation startIcon={<AddIcon />} onClick={openCreateVoucher} sx={{ ...darkBtnSx, px: 2.5 }}>
                              Create Voucher
                            </Button>
                          </Box>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <Box sx={{ px: 2.5, py: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap", borderTop: 1, borderColor: "divider" }}>
              <Box display="flex" alignItems="center" gap={1.5}>
                <Typography variant="body2" color="text.secondary">Rows</Typography>
                <TextField select size="small" value={rowsPerPage} onChange={(e) => setRowsPerPage(parseInt(e.target.value, 10))}
                  sx={{ minWidth: 80, "& .MuiOutlinedInput-root": { height: 36, borderRadius: 1 } }}>
                  {[5, 10, 25, 50].map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
                </TextField>
              </Box>
              <Box display="flex" alignItems="center" gap={0.75}>
                <IconButton size="small" aria-label="previous page" disabled={page === 0} onClick={() => setPage(page - 1)}
                  sx={{ ...ICON_BTN_SX, width: 34, height: 34 }}>
                  <ChevronLeftIcon fontSize="small" />
                </IconButton>
           {pageNumbers.map((n) => (
  <Button
    key={n}
    size="small"
    onClick={() => setPage(n)}
    variant={n === page ? "contained" : "outlined"}
    disableElevation
    sx={{
      minWidth: 34,
      width: 34,
      height: 34,
      p: 0,
      fontWeight: 600,

      ...(n === page
        ? {
            ...darkBtnSx,
            minWidth: 34,
            width: 34,
            height: 34,
            p: 0,
            borderRadius: "4px",
            transform: "none",
            "&:hover": {
              background: GREEN_DARK,
              transform: "none",
            },
          }
        : {
            ...ICON_BTN_SX,
            color: "text.primary",
            borderRadius: "4px",
          }),
    }}
  >
    {n + 1}
  </Button>
))}
                <IconButton size="small" aria-label="next page" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}
                  sx={{ ...ICON_BTN_SX, width: 34, height: 34 }}>
                  <ChevronRightIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
          </Paper>
        </>
      )}

      {/* =================== CREDIT / DEBIT NOTES TAB =================== */}
      {tab === 1 && (
        <Paper variant="outlined" sx={{ p: 2.5, ...CARD_SX }}>
          <Typography sx={{ ...sectionLabelSx, mb: 1.5 }}>Note details</Typography>
          <Grid container spacing={1.5} mb={3}>
            <Grid item xs={12} sm={3}>
              <TextField select fullWidth size="small" label="Note Type" value={noteType} onChange={(e) => setNoteType(e.target.value as "credit" | "debit")}>
                <MenuItem value="credit">Credit Note (Sales Return)</MenuItem>
                <MenuItem value="debit">Debit Note (Purchase Return)</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={5}>
              <TextField select fullWidth size="small" label={noteType === "credit" ? "Customer / Dealer" : "Supplier"} value={noteParty} onChange={(e) => setNoteParty(e.target.value)}>
                {ledgers.map((l) => <MenuItem key={l._id} value={l._id}>{ledgerLabel(l)}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth size="small" label="Remarks" value={noteRemarks} onChange={(e) => setNoteRemarks(e.target.value)} />
            </Grid>
          </Grid>

          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
            <Typography sx={sectionLabelSx}>Items ({noteLines.length})</Typography>
            <Button size="small" color="success" startIcon={<AddIcon />} onClick={noteAddLine} sx={{ textTransform: "none", fontWeight: 600 }}>Add line</Button>
          </Box>

          {noteLines.map((line, idx) => {
            const selectedItem = items.find((it) => it._id === line.item);
            const available = selectedItem?.stockQty ?? 0;
            const overStock = noteType === "debit" && selectedItem && Number(line.quantity) > available;
            return (
              <Paper key={idx} variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: 1, borderColor: overStock ? "error.main" : "divider" }}>
                <Grid container spacing={1.5} alignItems="flex-start">
                  <Grid item xs={12} sm={4}>
                    <TextField select fullWidth size="small" label="Item" value={line.item}
                      onChange={(e) => noteSelectItem(idx, e.target.value)}
                      helperText={selectedItem ? `Current stock: ${available} ${selectedItem.unit}` : " "}
                      FormHelperTextProps={{ sx: { color: overStock ? "error.main" : "text.secondary" } }}>
                      {items.map((it) => (
                        <MenuItem key={it._id} value={it._id}>
                          {it.name} ({it.unit}) - Stock: {it.stockQty ?? 0}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <TextField fullWidth size="small" type="number" label="Quantity" value={line.quantity}
                      error={!!overStock} helperText={overStock ? "Exceeds available stock" : " "}
                      onChange={(e) => noteUpdateLine(idx, { quantity: e.target.value })} />
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <TextField fullWidth size="small" type="number" label="Rate" value={line.rate}
                      helperText=" "
                      onChange={(e) => noteUpdateLine(idx, { rate: e.target.value })} />
                  </Grid>
                  <Grid item xs={4} sm={1.5}>
                    <Box sx={{ height: 40, display: "flex", alignItems: "center" }}>
                      <Chip size="small" label={`GST ${noteGstPercent(line).toFixed(0)}%`}
                        sx={{ bgcolor: "#eceff1", color: "#546e7a", fontWeight: 600, fontSize: 12.5 }} />
                    </Box>
                  </Grid>
                  <Grid item xs={5} sm={1.5}>
                    <Box sx={{ height: 40, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                      <Typography fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>₹{noteLineAmount(line).toLocaleString("en-IN")}</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={3} sm={1}>
                    <Box sx={{ height: 40, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                      <Tooltip title={noteLines.length === 1 ? "Kam se kam ek line chahiye" : "Remove line"}>
                        <span>
                          <IconButton size="small" color="error" aria-label="remove line"
                            onClick={() => noteRemoveLine(idx)} disabled={noteLines.length === 1}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  </Grid>
                </Grid>
              </Paper>
            );
          })}

          <Box sx={{
            mt: 2, p: 2, borderRadius: 1.5, bgcolor: GREEN_LIGHT, border: "1px solid #c8e0ca", boxShadow: "0 2px 8px rgba(46,125,50,0.10)",
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap",
          }}>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">Total (incl. GST)</Typography>
              <Typography variant="h5" fontWeight={700} sx={{ color: GREEN_DARK, fontVariantNumeric: "tabular-nums" }}>₹{noteTotal.toLocaleString("en-IN")}</Typography>
            </Box>
            <Button variant="contained" disableElevation sx={{ ...darkBtnSx, px: 3, height: 42 }}
              disabled={noteSaving || !noteParty || noteLines.some((l) => !l.item)}
              onClick={() => setConfirmNoteOpen(true)}>
              {noteSaving ? "Saving..." : `Save ${noteType === "credit" ? "Credit" : "Debit"} Note`}
            </Button>
          </Box>

          <Alert severity="info" variant="outlined" sx={{ mt: 2, borderRadius: 1 }}>
            {noteType === "credit"
              ? "Credit Note customer ka baaki kam karta hai aur wapas aaya stock andar le aata hai."
              : "Debit Note supplier ko dena kam karta hai aur wapas bheja stock bahar nikalta hai (stock kam ho to block ho jata hai)."}
          </Alert>
        </Paper>
      )}

      {/* =================== CREATE VOUCHER POPUP =================== */}
      <Dialog open={voucherDialogOpen} onClose={closeCreateVoucher} fullWidth maxWidth="md"
        PaperProps={{ sx: { borderRadius: 1.5, boxShadow: "0 24px 60px rgba(16,40,22,0.3)", ...fontSx } }}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1.5, mb: 2, bgcolor: "#f3f9f3", borderBottom: "1px solid #dbe7db" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 700, color: GREEN_DARK }}>Create voucher</Typography>
          <Box display="flex" alignItems="center" gap={0.5}>
            <Button size="small" color="inherit" startIcon={<InfoOutlinedIcon fontSize="small" />}
              onClick={() => setShowHelp((v) => !v)} sx={{ color: "text.secondary", textTransform: "none", fontWeight: 500 }}>
              How vouchers get created
            </Button>
            <IconButton aria-label="close" size="small" onClick={closeCreateVoucher}><CloseIcon fontSize="small" /></IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" display="block" mb={2}>
            Har voucher ek account se doosre account me paisa move karta hai - dono chuno. Receipt me paisa
            dealer se aata hai aur Cash/Bank me jaata hai; Payment me ulta.
          </Typography>

          <Collapse in={showHelp} unmountOnExit>
            <Alert severity="info" variant="outlined" onClose={() => setShowHelp(false)} sx={{ mb: 2, borderRadius: 1, alignItems: "flex-start" }}>
              <Typography variant="body2" component="div">
                Zyada-tar vouchers yahan manually type hote hain (<Chip size="small" label="Manual" sx={{ mx: 0.5 }} />).
                Kuch automatically post hote hain jab doosri screen ka action approve hota hai - salesman ka field
                collection (admin approval par) ya expense claim (Super Admin ki final approval par) -
                <Chip size="small" color="secondary" label="auto" sx={{ mx: 0.5 }} /> Source column me dikhte hain.
                Sales Bill ka "Receive Payment" aur Purchase Bill ka "Make Payment" bhi seedha yahin post hota hai, is form ke bina.
              </Typography>
            </Alert>
          </Collapse>

          <Grid container spacing={1.5} sx={{ mt: 0 }}>
            <Grid item xs={12} sm={4}>
              <TextField select fullWidth size="small" label="Voucher Type" value={form.voucherType}
                onChange={(e) => handleVoucherTypeChange(e.target.value)}>
                {VOUCHER_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth size="small" type="number" label="Amount" value={form.amount}
                InputProps={{ startAdornment: <Typography color="text.secondary" mr={0.5}>₹</Typography> }}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={4} />
            <Grid item xs={12} sm={6}>
              <TextField select fullWidth size="small" label="Credit Account (money comes from)" value={form.creditAccount}
                onChange={(e) => setForm({ ...form, creditAccount: e.target.value })}>
                {ledgers.filter((l) => l._id !== form.debitAccount).map((l) => <MenuItem key={l._id} value={l._id}>{ledgerLabel(l)}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField select fullWidth size="small" label="Debit Account (money goes into)" value={form.debitAccount}
                onChange={(e) => setForm({ ...form, debitAccount: e.target.value })}>
                {ledgers.filter((l) => l._id !== form.creditAccount).map((l) => <MenuItem key={l._id} value={l._id}>{ledgerLabel(l)}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Narration" value={form.narration}
                onChange={(e) => setForm({ ...form, narration: e.target.value })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, mt: 1, bgcolor: "#f8fbf8", borderTop: "1px solid #e6eee6" }}>
          <Button onClick={closeCreateVoucher} color="inherit" disabled={saving} sx={{ textTransform: "none", fontWeight: 600 }}>
            Cancel
          </Button>
          <Button variant="contained" disableElevation sx={{ ...darkBtnSx, px: 3, height: 40 }}
            disabled={saving || voucherFormInvalid}
            onClick={() => setConfirmVoucherOpen(true)}>
            {saving ? "Saving..." : "Save Voucher"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Voucher?"
        message={`This will delete voucher "${deleteTarget?.voucherNumber}" and reverse its effect on the ledger balance. This cannot be undone.`}
        loading={deleting}
        onConfirm={handleDeleteVoucher}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={confirmVoucherOpen}
        title="Post this Voucher?"
        message={`This will immediately post ₹${form.amount || 0} and update both ledger balances. This cannot be undone from here except by deleting the voucher afterwards.`}
        loading={saving}
        onConfirm={handleSaveVoucher}
        onCancel={() => setConfirmVoucherOpen(false)}
      />

      <ConfirmDialog
        open={confirmNoteOpen}
        title={`Post this ${noteType === "credit" ? "Credit" : "Debit"} Note?`}
        message={`This will immediately post ₹${noteTotal.toLocaleString("en-IN")}, adjust the party's balance, reverse the GST, and move stock. This cannot be undone from here except by cancelling the note afterwards.`}
        loading={noteSaving}
        onConfirm={handleSaveNote}
        onCancel={() => setConfirmNoteOpen(false)}
      />
    </Box>
  );
}