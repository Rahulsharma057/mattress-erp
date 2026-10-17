"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import {
  Typography, Button, Drawer, TextField, MenuItem, Table, TableHead, TableRow, TableCell, TableBody,
  Paper, TableContainer, Box, Chip, IconButton, Tooltip, Divider,
  FormControlLabel, Switch, Tabs, Tab, Grid, InputAdornment, TablePagination, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import HistoryIcon from "@mui/icons-material/History";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import api from "@/lib/api";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useSnackbar } from "@/components/SnackbarProvider";

interface AccountGroup { _id: string; name: string; }
interface SalesmanUser { _id: string; name: string; role: string; }
interface Ledger {
  _id: string; dealerCode?: string; name: string; entityType: string; dealerType?: string;
  accountGroup: AccountGroup; salesman?: SalesmanUser; mobile?: string; email?: string;
  gstin?: string; state?: string; city?: string; ledgerType: "registered" | "unregistered";
  isActive: boolean; currentBalance: number; creditLimit?: number;
  bankAccountHolderName?: string; bankAccountNumber?: string; bankIfscCode?: string; bankName?: string;
}
interface LedgersPage { ledgers: Ledger[]; pagination: { page: number; limit: number; total: number; totalPages: number }; }
interface LedgerEvent { type: string; date: string; reference: string; description: string; amount: number; drCr: string; runningBalance: number; }
interface LedgerSummary {
  openingBalance: number; totalSales: number; totalPurchases: number; totalReceipts: number;
  totalPayments: number; totalCreditNotes: number; totalDebitNotes: number;
  currentOutstanding: number; overdueAmount?: number;
}
interface AgingRow {
  billNumber: string; date: string; dueDate: string; amount: number;
  received: number; outstandingAmount: number; daysOverdue: number; bucket: string;
}
interface AgingData { buckets: Record<string, number>; overdueAmount: number; invoices: AgingRow[]; }
interface SalesmanAssignment { salesman?: { _id: string; name: string }; assignedFrom: string; assignedTo: string | null; }
interface DealerCollection { _id: string; date: string; amount: number; status: string; salesman?: { name: string }; paymentMode: string; }
interface DealerItemSummary { name: string; unit: string; totalQty: number; totalAmount: number; }
interface DealerVisit { _id: string; visitTime: string; salesman?: { name: string }; remarks?: string; }
interface DealerHistory {
  salesmanHistory: SalesmanAssignment[];
  collectionsSummary: Record<string, number>;
  collections: DealerCollection[];
  itemsSummary: DealerItemSummary[];
  visits: DealerVisit[];
}

const AGING_BUCKET_COLOR: Record<string, "default" | "success" | "warning" | "error"> = {
  "Not Due": "success", "0-30": "success", "31-60": "warning", "61-90": "warning", "91-180": "error", "180+": "error",
};
const collectionStatusColor: Record<string, "warning" | "success" | "error"> = {
  pending_approval: "warning", approved: "success", rejected: "error",
};

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

const emptyForm = {
  name: "", entityType: "dealer", dealerType: "wholesale", gstin: "", panNumber: "", mobile: "",
  email: "", website: "", isActive: true, accountGroup: "", salesman: "",
  address: "", shippingAddress: "", city: "", pincode: "", state: "", country: "India",
  contactPerson: "", designation: "", landlineNumber: "", paymentTermsDays: "", creditLimit: "",
  ledgerType: "unregistered", gstState: "", placeOfSupply: "",
  tcsApplicable: false, tdsApplicable: false, ewayBillApplicable: false,
  businessNature: "", remarks: "",
  bankAccountHolderName: "", bankAccountNumber: "", bankIfscCode: "", bankName: "",
};

/* ---------- Shared theme tokens (green theme, same as Account Groups) ---------- */
const ACCENT = "#2E7D32"; // theme primary.main
const ACCENT_DARK = "#1B5E20"; // theme primary.dark
const ACCENT_SOFT = "#EAF3EA";
const SURFACE = "#F8FAF8";

const scrollbarSx = {
  scrollbarWidth: "thin",
  scrollbarColor: "#B8C5D6 transparent",
  "&::-webkit-scrollbar": { width: 7, height: 7 },
  "&::-webkit-scrollbar-thumb": { bgcolor: "#B8C5D6", borderRadius: 10 },
  "&::-webkit-scrollbar-thumb:hover": { bgcolor: "#8497B0" },
  "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
} as const;

const tabsSx = {
  px: 2,
  minHeight: 44,
  bgcolor: "background.paper",
  "& .MuiTabs-indicator": { height: 3, borderRadius: "3px 3px 0 0", bgcolor: ACCENT },
  "& .MuiTab-root": {
    minHeight: 44, px: 1.75, textTransform: "none", fontSize: 12.5, fontWeight: 600, color: "text.secondary",
  },
  "& .MuiTab-root.Mui-selected": { color: ACCENT },
} as const;

const greenBtnSx = {
  textTransform: "none",
  fontSize: 13,
  fontWeight: 700,
  borderRadius: 1.25,
  px: 2.25,
  bgcolor: ACCENT,
  color: "#fff",
  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.22)", // halka black shadow
  "&:hover": { bgcolor: ACCENT_DARK, boxShadow: "0 4px 10px rgba(0, 0, 0, 0.28)" },
  "&:active": { boxShadow: "0 1px 3px rgba(0, 0, 0, 0.25)" },
  "&.Mui-disabled": { bgcolor: "#C8D8C6", color: "#fff", boxShadow: "none" },
} as const;

const ghostBtnSx = { textTransform: "none", fontSize: 13, fontWeight: 600, color: "text.secondary", borderRadius: 1.25 } as const;

const fieldsWrapSx = {
  "& .MuiTextField-root": {
    "& .MuiInputBase-root": { fontSize: 13, borderRadius: 1.25, bgcolor: "#fff" },
    "& .MuiInputLabel-root": { fontSize: 13 },
    "& .MuiOutlinedInput-root.Mui-focused fieldset": { borderColor: ACCENT },
    "& .MuiInputLabel-root.Mui-focused": { color: ACCENT },
  },
  "& .MuiFormControlLabel-label": { fontSize: 12.5 },
  "& .MuiSwitch-switchBase.Mui-checked": { color: ACCENT },
  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { bgcolor: ACCENT },
} as const;

const miniChipSx = { height: 21, borderRadius: "4px", fontSize: 10.5, fontWeight: 600 } as const;

const iconBtnSx = {
  p: 0.65,
  color: "text.secondary",
  "&:hover": { color: ACCENT, bgcolor: "rgba(46,125,50,0.08)" },
} as const;

const drawerTablesSx = {
  "& .MuiTableCell-root": { px: 1.25, py: 0.85, fontSize: 12, borderColor: "divider", whiteSpace: "nowrap" },
  "& .MuiTableCell-head": {
    bgcolor: "#EAF3EA", color: ACCENT_DARK, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.03em",
  },
  "& .MuiTableContainer-root": {
    bgcolor: "#fff", border: "1px solid", borderColor: "divider", borderRadius: 1.5,
  },
  "& .MuiTableBody-root .MuiTableRow-root:hover": { bgcolor: ACCENT_SOFT },
  "& .MuiTableBody-root .MuiTableRow-root:last-child .MuiTableCell-root": { borderBottom: 0 },
} as const;

// Sticky header + sticky section tabs + sticky footer buttons, with only the middle scrolling.
// Used by both the Add/Edit form and Dealer 360.
function DrawerShell({
  open, onClose, width, header, tabsBar, children, footer,
}: {
  open: boolean; onClose: () => void; width: { xs: string | number; sm: number };
  header: React.ReactNode; tabsBar?: React.ReactNode; children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { width, maxWidth: "100%", height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden" },
      }}
    >
      {/* Sticky top: header */}
      <Box
        sx={{
          px: 2.5, py: 1.75, flexShrink: 0, bgcolor: "background.paper",
          borderTop: `3px solid ${ACCENT}`, borderBottom: 1, borderColor: "divider",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        }}
      >
        <Box minWidth={0}>{header}</Box>
        <IconButton size="small" onClick={onClose} sx={{ ml: 1, flexShrink: 0, color: "text.secondary" }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Sticky top: section tabs */}
      {tabsBar && (
        <Box sx={{ flexShrink: 0, bgcolor: "background.paper", borderBottom: 1, borderColor: "divider" }}>{tabsBar}</Box>
      )}

      {/* Scrollable middle */}
      <Box sx={{ flex: "1 1 0", minHeight: 0, overflowY: "auto", px: 2.5, py: 2.25, bgcolor: SURFACE, ...scrollbarSx }}>
        {children}
      </Box>

      {/* Sticky bottom: action buttons */}
      <Box
        sx={{
          flexShrink: 0, px: 2.5, py: 1.5, pb: "max(12px, env(safe-area-inset-bottom))",
          bgcolor: "background.paper", borderTop: 1, borderColor: "divider",
          boxShadow: "0 -4px 12px rgba(15, 23, 42, 0.05)",
          display: "flex", justifyContent: "flex-end", gap: 1,
        }}
      >
        {footer}
      </Box>
    </Drawer>
  );
}

export default function LedgerMasterPage() {
  const { showMessage } = useSnackbar();

  // Page ko viewport me fit karta hai (parent layout kaisa bhi ho): root ki height =
  // screen height - root ka top offset - bottom gap. Isse poora page scroll nahi hota,
  // sirf table ke andar scroll hota hai aur pagination hamesha neeche dikhta hai.
  const rootRef = useRef<HTMLDivElement>(null);
  const [rootH, setRootH] = useState<number | null>(null);
  useEffect(() => {
    const calc = () => {
      const el = rootRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setRootH(Math.max(480, window.innerHeight - top - 24));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Ledger | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState(0);

  // Search is debounced (300ms) and runs server-side - never by downloading every dealer
  // into the browser and filtering there.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [page, setPage] = useState(0); // MUI TablePagination is 0-indexed
  const [rowsPerPage, setRowsPerPage] = useState(25);
  useEffect(() => { setPage(0); }, [search]);

  const ledgersKey = `/masters/ledgers?page=${page + 1}&limit=${rowsPerPage}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
  // keepPreviousData (set globally in the dashboard layout's SWRConfig) avoids a flash of
  // empty rows while a new page/search loads, and revisiting this screen after navigating
  // away shows the last-known page instantly from cache while it quietly revalidates.
  const { data: ledgersRes, isLoading, error: ledgersError, mutate: refetchLedgers } = useSWR<LedgersPage>(ledgersKey);
  const { data: groups = [], mutate: refetchGroups } = useSWR<AccountGroup[]>("/masters/account-groups");
  const { data: users = [] } = useSWR<SalesmanUser[]>("/users", { shouldRetryOnError: false }); // non-super-admins can't list users

  // Defensive: works whether the API returns { ledgers, pagination } or a plain array
  const ledgers: Ledger[] = Array.isArray(ledgersRes) ? (ledgersRes as unknown as Ledger[]) : ledgersRes?.ledgers || [];
  const total = ledgersRes?.pagination?.total ?? ledgers.length;
  const salesmen = users.filter((u) => u.role === "salesman");

  const [statementTarget, setStatementTarget] = useState<Ledger | null>(null);
  const [statement, setStatement] = useState<{ ledger: any; summary: LedgerSummary; events: LedgerEvent[] } | null>(null);
  const [aging, setAging] = useState<AgingData | null>(null);
  const [dealerHistory, setDealerHistory] = useState<DealerHistory | null>(null);
  const [dealer360Tab, setDealer360Tab] = useState(0);
  const [creditLimitDraft, setCreditLimitDraft] = useState("");
  const [editingCreditLimit, setEditingCreditLimit] = useState(false);
  const [savingCreditLimit, setSavingCreditLimit] = useState(false);
  const [statementLoading, setStatementLoading] = useState(false);

  // Remembers who was assigned when the drawer opened, so the Salesman field can show
  // "currently assigned to X" even after the dropdown's own value has been changed to
  // preview a different salesman - otherwise there is no visible difference between "this
  // dealer already has a salesman" and "picking one for the first time".
  const [originalSalesman, setOriginalSalesman] = useState<SalesmanUser | null>(null);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setOriginalSalesman(null); setTab(0); setOpen(true); };
  const openEdit = (l: Ledger) => {
    setEditingId(l._id);
    setOriginalSalesman(l.salesman || null);
    setForm({
      ...emptyForm,
      name: l.name, entityType: l.entityType || "dealer", dealerType: l.dealerType || "wholesale",
      gstin: l.gstin || "", mobile: l.mobile || "", email: l.email || "",
      isActive: l.isActive, accountGroup: l.accountGroup?._id || "", salesman: l.salesman?._id || "",
      city: l.city || "", state: l.state || "", ledgerType: l.ledgerType,
      creditLimit: String(l.creditLimit || ""),
      bankAccountHolderName: l.bankAccountHolderName || "", bankAccountNumber: l.bankAccountNumber || "",
      bankIfscCode: l.bankIfscCode || "", bankName: l.bankName || "",
    });
    setTab(0);
    setOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form, creditLimit: Number(form.creditLimit || 0), paymentTermsDays: form.paymentTermsDays ? Number(form.paymentTermsDays) : undefined, salesman: form.salesman || undefined };
      if (editingId) {
        await api.put(`/masters/ledgers/${editingId}`, payload);
        showMessage("Dealer/Ledger updated", "success");
      } else {
        await api.post("/masters/ledgers", payload);
        showMessage("Dealer/Ledger created", "success");
      }
      setOpen(false);
      await refetchLedgers();
    } catch (error: any) {
      showMessage(
        error?.response?.data?.message || error?.message || "Unable to save dealer/ledger",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/masters/ledgers/${deleteTarget._id}`);
      showMessage("Ledger deleted", "success");
      setDeleteTarget(null);
      await refetchLedgers();
    } catch (error: any) {
      showMessage(
        error?.response?.data?.message || error?.message || "Unable to delete ledger",
        "error",
      );
    } finally {
      setDeleting(false);
    }
  };

  const openStatement = async (l: Ledger) => {
    setStatementTarget(l);
    setDealer360Tab(0);
    setAging(null);
    setDealerHistory(null);
    setEditingCreditLimit(false);
    setCreditLimitDraft(String(l.creditLimit || ""));
    setStatement(null);
    setStatementLoading(true);
    try {
      const [res, agingRes, historyRes] = await Promise.all([
        api.get(`/masters/ledgers/${l._id}/transactions`),
        api.get(`/masters/ledgers/${l._id}/aging`),
        api.get(`/masters/ledgers/${l._id}/dealer-history`),
      ]);
      setStatement(res.data);
      setAging(agingRes.data);
      setDealerHistory(historyRes.data);
    } catch (error: any) {
      showMessage(
        error?.response?.data?.message || error?.message || "Unable to load dealer statement",
        "error",
      );
    } finally {
      setStatementLoading(false);
    }
  };

  const saveCreditLimit = async () => {
    if (!statementTarget) return;
    setSavingCreditLimit(true);
    try {
      await api.put(`/masters/ledgers/${statementTarget._id}`, { creditLimit: Number(creditLimitDraft || 0) });
      showMessage("Credit limit updated", "success");
      setEditingCreditLimit(false);
      setStatementTarget({ ...statementTarget, creditLimit: Number(creditLimitDraft || 0) });
      await refetchLedgers();
    } catch (error: any) {
      showMessage(
        error?.response?.data?.message || error?.message || "Unable to update credit limit",
        "error",
      );
    } finally {
      setSavingCreditLimit(false);
    }
  };

  // A standalone Individual account (an employee advance, a petty-cash custodian, a personal
  // ledger) needs none of the Dealer/Supplier-only fields - dispatch address, credit limit,
  // salesman assignment, wholesale/retail type - which the form otherwise requires.
  const isIndividual = form.entityType === "individual";

  // Lets the user create a brand-new Account Group right from this form, instead of having
  // to leave and use the separate Account Groups screen first.
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupNature, setNewGroupNature] = useState("asset");
  const [savingGroup, setSavingGroup] = useState(false);
  const handleCreateGroup = async () => {
    setSavingGroup(true);
    try {
      const res = await api.post("/masters/account-groups", { name: newGroupName, nature: newGroupNature });
      await refetchGroups();
      setForm((f) => ({ ...f, accountGroup: res.data._id }));
      showMessage("Account group created", "success");
      setNewGroupOpen(false);
      setNewGroupName("");
    } finally {
      setSavingGroup(false);
    }
  };

  const eventColor: Record<string, "info" | "warning" | "success" | "error" | "default"> = {
    sales_bill: "info", purchase_bill: "warning", receipt: "success", payment: "error",
    credit_note: "success", debit_note: "error", contra: "default", journal: "default",
  };

  return (
    <>
      <Box
        ref={rootRef}
        sx={{
          height: rootH ? `${rootH}px` : "calc(100dvh - 120px)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          minWidth: 0,
          width: "100%",
          color: "text.primary",
        }}
      >
        {/* ===== Page header ===== */}
        <Box
          sx={{
            display: "flex",
            alignItems: { xs: "stretch", sm: "center" },
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 1.5,
            flexShrink: 0,
          }}
        >
          <Box>
            <Typography sx={{ fontSize: { xs: 17, sm: 19 }, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.3 }}>
              Dealer / Ledger Master
            </Typography>
            <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.25 }}>
              Manage dealer details, balances and credit status
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: { xs: "100%", sm: "auto" } }}>
            <TextField
              size="small"
              placeholder="Search name or code"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              sx={{
                width: { xs: "100%", sm: 260 },
                "& .MuiOutlinedInput-root": {
                  height: 36, borderRadius: 1.25, bgcolor: "background.paper", fontSize: 13,
                  "&.Mui-focused fieldset": { borderColor: ACCENT },
                },
              }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: "text.secondary" }} /></InputAdornment>,
                endAdornment: isLoading ? <InputAdornment position="end"><CircularProgress size={14} sx={{ color: ACCENT }} /></InputAdornment> : undefined,
              }}
            />
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={openCreate}
              sx={{ ...greenBtnSx, minWidth: "max-content", height: 36 }}
            >
              Add Dealer
            </Button>
          </Box>
        </Box>

        {/* ===== Table card ===== */}
        <Paper
          variant="outlined"
          sx={{
            flex: "1 1 0",
            minHeight: 300,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderColor: "divider",
            borderRadius: 2,
            boxShadow: "0 2px 8px rgba(15, 23, 42, 0.035)",
          }}
        >
          <TableContainer
            sx={{
              flex: "1 1 0",
              minHeight: 200,
              width: "100%",
              overflow: "auto", // scroll sirf yahan (rows + sticky header + sticky Actions)
              ...scrollbarSx,
            }}
          >
            <Table
              stickyHeader
              size="small"
              sx={{
                minWidth: 1000,
                "& .MuiTableCell-root": { px: 1.5, py: 0.8, fontSize: 12.5, borderColor: "divider", whiteSpace: "nowrap" },
                "& .MuiTableCell-head": {
                  bgcolor: ACCENT, color: "#f0f5f2", fontSize: 11.5, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.04em", py: 1.1, borderBottom: 0,
                },
                "& .MuiTableBody-root .MuiTableRow-root:nth-of-type(even)": { bgcolor: SURFACE },
                "& .MuiTableBody-root .MuiTableRow-root:hover": { bgcolor: ACCENT_SOFT },
                "& .MuiTableBody-root .MuiTableRow-root:last-child .MuiTableCell-root": { borderBottom: 0 },

                // ===== Sticky Actions column (right side, horizontal scroll me bhi fixed) =====
                "& .actions-cell": {
                  position: "sticky",
                  right: 0,
                  zIndex: 1,
                  bgcolor: "background.paper",
                  boxShadow: "-8px 0 8px -8px rgba(15, 23, 42, 0.18)",
                },
                "& .MuiTableCell-head.actions-cell": { bgcolor: ACCENT, zIndex: 3, boxShadow: "-8px 0 8px -8px rgba(0,0,0,0.3)" },
                "& .MuiTableBody-root .MuiTableRow-root:nth-of-type(even) .actions-cell": { bgcolor: SURFACE },
                "& .MuiTableBody-root .MuiTableRow-root:hover .actions-cell": { bgcolor: ACCENT_SOFT },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>Code</TableCell><TableCell>Name</TableCell><TableCell>Type</TableCell>
                  <TableCell>Account Group</TableCell><TableCell>Salesman</TableCell><TableCell>Mobile</TableCell>
                  <TableCell align="right">Balance</TableCell><TableCell>Credit Status</TableCell>
                  <TableCell>Status</TableCell><TableCell align="right" className="actions-cell">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ledgers.map((l) => (
                  <TableRow key={l._id} hover>
                    <TableCell><Typography variant="caption" color="text.secondary" fontWeight={600}>{l.dealerCode}</Typography></TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{l.name}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={`${l.entityType}${l.dealerType ? " / " + l.dealerType : ""}`}
                        sx={{ ...miniChipSx, bgcolor: "#EEF2F6", color: "#475467", textTransform: "capitalize", "& .MuiChip-label": { px: 0.8 } }}
                      />
                    </TableCell>
                    <TableCell>{l.accountGroup?.name}</TableCell>
                    <TableCell>{l.salesman?.name || "-"}</TableCell>
                    <TableCell>{l.mobile || "-"}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>₹{l.currentBalance?.toLocaleString("en-IN") ?? 0}</TableCell>
                    <TableCell>
                      {l.entityType === "dealer" && l.creditLimit ? (
                        (l.currentBalance || 0) > l.creditLimit ? (
                          <Chip size="small" color="error" label={`Over ₹${((l.currentBalance || 0) - l.creditLimit).toLocaleString("en-IN")}`} sx={miniChipSx} />
                        ) : (
                          <Chip size="small" color="success" label={`Avail. ₹${(l.creditLimit - (l.currentBalance || 0)).toLocaleString("en-IN")}`} sx={miniChipSx} />
                        )
                      ) : (
                        <Typography variant="caption" color="text.secondary">-</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" color={l.isActive ? "success" : "default"} label={l.isActive ? "Active" : "Inactive"} sx={miniChipSx} />
                    </TableCell>
                    <TableCell align="right" className="actions-cell">
                      <Tooltip title="View Statement"><IconButton size="small" onClick={() => openStatement(l)} sx={iconBtnSx}><HistoryIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(l)} sx={iconBtnSx}><EditIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Delete"><IconButton size="small" onClick={() => setDeleteTarget(l)} sx={{ p: 0.65, color: "text.secondary", "&:hover": { color: "error.main", bgcolor: "rgba(211, 47, 47, 0.08)" } }}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {ledgers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 5, color: "text.secondary" }}>
                      {isLoading ? (
                        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                          <CircularProgress size={18} sx={{ color: ACCENT }} /> Loading dealers...
                        </Box>
                      ) : ledgersError ? (
                        <Box sx={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                          Unable to load dealers.
                          <Typography variant="caption" color="error">
                            {(ledgersError as any)?.response?.data?.message || (ledgersError as any)?.message || ""}
                            {(ledgersError as any)?.response?.status ? ` (HTTP ${(ledgersError as any).response.status})` : ""}
                          </Typography>
                          <Button size="small" onClick={() => void refetchLedgers()} sx={{ textTransform: "none", color: ACCENT }}>Retry</Button>
                        </Box>
                      ) : (
                        "No dealers/ledgers found"
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Divider />
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
            rowsPerPageOptions={[10, 25, 50, 100]}
            sx={{
              flexShrink: 0,
              bgcolor: "#F4F7F4",
              "& .MuiTablePagination-toolbar": { minHeight: 44, px: 1.5 },
              "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": { fontSize: 12, m: 0 },
            }}
          />
        </Paper>
      </Box>

      {/* ---------- Add/Edit Dealer - right-anchored drawer, sectioned like a real dealer-onboarding form ---------- */}
   <DrawerShell
  open={open}
  onClose={() => setOpen(false)}
  width={{ xs: "100%", sm: 560 }}
  header={
    <>
      <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
        {editingId ? "Edit Dealer" : "Add Dealer"}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {editingId
          ? `Code: ${ledgers.find((l) => l._id === editingId)?.dealerCode || "-"}`
          : "Dealer Code will be auto-generated on save"}
      </Typography>
    </>
  }
  tabsBar={
    <Tabs
      value={tab}
      onChange={(_, v) => setTab(v)}
      variant="scrollable"
      scrollButtons="auto"
      sx={tabsSx}
    >
      <Tab label="Basic Details" />
      <Tab label="Address" />
      <Tab label="Business & Tax" />
      <Tab label="Additional Info" />
    </Tabs>
  }
  footer={
    <>
      <Button onClick={() => setOpen(false)} sx={ghostBtnSx}>
        Cancel
      </Button>
      <Button
        sx={greenBtnSx}
        variant="contained"
        disabled={
          saving ||
          !form.name ||
          !form.accountGroup ||
          // Dispatch address, mobile, and credit limit only make sense for a Dealer/Supplier -
          // a standalone Individual account (an employee advance, a petty-cash custodian...)
          // needs just a name and an account group to post money in/out of.
          (form.entityType !== "individual" && (
            !form.mobile ||
            !form.address ||
            !form.city ||
            !form.pincode ||
            !form.state ||
            !form.creditLimit
          ))
        }
        onClick={handleSave}
      >
        {saving ? "Saving..." : editingId ? "Update" : "Submit for Approval"}
      </Button>
    </>
  }
>
  <Box sx={fieldsWrapSx}>
    {tab === 0 && (
      <Grid container spacing={1.75}>
        <Grid item xs={12} sm={6}>
          <TextField
            select
            fullWidth
            size="small"
            label="Entity Type *"
            value={form.entityType}
            onChange={(e) =>
              setForm({ ...form, entityType: e.target.value })
            }
            helperText={isIndividual ? "A standalone personal/self account - no dealer-only fields required" : " "}
          >
            <MenuItem value="dealer">Dealer</MenuItem>
            <MenuItem value="supplier">Supplier</MenuItem>
            <MenuItem value="individual">Individual (self account)</MenuItem>
          </TextField>
        </Grid>

        {!isIndividual && (
          <Grid item xs={12} sm={6}>
            <TextField
              select
              fullWidth
              size="small"
              label="Dealer Type *"
              value={form.dealerType}
              onChange={(e) =>
                setForm({ ...form, dealerType: e.target.value })
              }
            >
              <MenuItem value="wholesale">Wholesale</MenuItem>
              <MenuItem value="retail">Retail</MenuItem>
            </TextField>
          </Grid>
        )}

        <Grid item xs={12}>
          <TextField
            fullWidth
            size="small"
            label={isIndividual ? "Account Name *" : "Dealer / Party Name *"}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            size="small"
            label="GSTIN"
            value={form.gstin}
            onChange={(e) => setForm({ ...form, gstin: e.target.value })}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            size="small"
            label="PAN Number"
            value={form.panNumber}
            onChange={(e) =>
              setForm({ ...form, panNumber: e.target.value })
            }
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            size="small"
            label={isIndividual ? "Mobile Number" : "Mobile Number *"}
            value={form.mobile}
            onChange={(e) => setForm({ ...form, mobile: e.target.value })}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            size="small"
            label="Email ID"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            size="small"
            label="Website"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormControlLabel
            control={
              <Switch
                checked={form.isActive}
                onChange={(e) =>
                  setForm({ ...form, isActive: e.target.checked })
                }
              />
            }
            label={form.isActive ? "Active" : "Inactive"}
          />
        </Grid>

        <Grid item xs={12} sm={isIndividual ? 9 : 6}>
          <TextField
            select
            fullWidth
            size="small"
            label="Account Group *"
            value={form.accountGroup}
            onChange={(e) =>
              setForm({ ...form, accountGroup: e.target.value })
            }
          >
            {groups.map((g) => (
              <MenuItem key={g._id} value={g._id}>
                {g.name}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        {isIndividual && (
          <Grid item xs={12} sm={3}>
            <Button fullWidth variant="outlined" size="small" sx={{ height: "100%", textTransform: "none" }} onClick={() => setNewGroupOpen(true)}>
              + New Group
            </Button>
          </Grid>
        )}

        {!isIndividual && (
          <Grid item xs={12} sm={6}>
            <TextField
              select
              fullWidth
              size="small"
              label="Salesman Assigned"
              value={form.salesman}
              onChange={(e) => setForm({ ...form, salesman: e.target.value })}
              helperText={
                originalSalesman
                  ? form.salesman === originalSalesman._id
                    ? `Currently assigned to ${originalSalesman.name} - pick someone else to reassign`
                    : `Reassigning from ${originalSalesman.name} to ${salesmen.find((s) => s._id === form.salesman)?.name || "Unassigned"} - recorded in history on save`
                  : "No salesman assigned yet"
              }
            >
              <MenuItem value="">- Unassigned -</MenuItem>
              {salesmen.map((s) => (
                <MenuItem key={s._id} value={s._id}>
                  {s.name}{originalSalesman?._id === s._id ? " (current)" : ""}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        )}
      </Grid>
    )}

    {tab === 1 && (
      <Grid container spacing={1.75}>
        <Grid item xs={12}>
          <TextField
            fullWidth
            multiline
            rows={2}
            size="small"
            label={isIndividual ? "Billing Address" : "Billing Address *"}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            multiline
            rows={2}
            size="small"
            label="Shipping Address"
            value={form.shippingAddress}
            onChange={(e) =>
              setForm({ ...form, shippingAddress: e.target.value })
            }
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            size="small"
            label={isIndividual ? "City" : "City *"}
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            size="small"
            label={isIndividual ? "PIN Code" : "PIN Code *"}
            value={form.pincode}
            onChange={(e) => setForm({ ...form, pincode: e.target.value })}
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            select
            fullWidth
            size="small"
            label={isIndividual ? "State" : "State *"}
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
          >
            {INDIAN_STATES.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            size="small"
            label="Country"
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value })}
          />
        </Grid>
      </Grid>
    )}

    {tab === 2 && (
      <Grid container spacing={1.75}>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            size="small"
            label="Contact Person"
            value={form.contactPerson}
            onChange={(e) =>
              setForm({ ...form, contactPerson: e.target.value })
            }
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            size="small"
            label="Designation"
            value={form.designation}
            onChange={(e) =>
              setForm({ ...form, designation: e.target.value })
            }
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            size="small"
            label="Landline Number"
            value={form.landlineNumber}
            onChange={(e) =>
              setForm({ ...form, landlineNumber: e.target.value })
            }
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            size="small"
            type="number"
            label="Payment Terms (Days)"
            value={form.paymentTermsDays}
            onChange={(e) =>
              setForm({ ...form, paymentTermsDays: e.target.value })
            }
          />
        </Grid>

        {!isIndividual && (
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              required
              type="number"
              label="Credit Limit (₹) *"
              value={form.creditLimit}
              onChange={(e) =>
                setForm({ ...form, creditLimit: e.target.value })
              }
            />
          </Grid>
        )}

        <Grid item xs={12}>
          <Divider sx={{ my: 1 }}>
            <Chip
              label="Tax Details"
              size="small"
              sx={{
                bgcolor: ACCENT_SOFT,
                color: ACCENT_DARK,
                fontWeight: 600,
              }}
            />
          </Divider>
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            select
            fullWidth
            size="small"
            label="GST Treatment"
            value={form.ledgerType}
            onChange={(e) =>
              setForm({ ...form, ledgerType: e.target.value })
            }
          >
            <MenuItem value="registered">Registered</MenuItem>
            <MenuItem value="unregistered">Unregistered</MenuItem>
          </TextField>
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            select
            fullWidth
            size="small"
            label="GST State"
            value={form.gstState}
            onChange={(e) => setForm({ ...form, gstState: e.target.value })}
          >
            {INDIAN_STATES.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            select
            fullWidth
            size="small"
            label="Place of Supply"
            value={form.placeOfSupply}
            onChange={(e) =>
              setForm({ ...form, placeOfSupply: e.target.value })
            }
          >
            {INDIAN_STATES.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
        </Grid>

        <Grid item xs={12} sm={4}>
          <FormControlLabel
            control={
              <Switch
                checked={form.tcsApplicable}
                onChange={(e) =>
                  setForm({ ...form, tcsApplicable: e.target.checked })
                }
              />
            }
            label="TCS Applicable"
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <FormControlLabel
            control={
              <Switch
                checked={form.tdsApplicable}
                onChange={(e) =>
                  setForm({ ...form, tdsApplicable: e.target.checked })
                }
              />
            }
            label="TDS Applicable"
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <FormControlLabel
            control={
              <Switch
                checked={form.ewayBillApplicable}
                onChange={(e) =>
                  setForm({ ...form, ewayBillApplicable: e.target.checked })
                }
              />
            }
            label="E-Way Bill Applicable"
          />
        </Grid>

        <Grid item xs={12}>
          <Divider sx={{ my: 1 }}>
            <Chip
              label="Bank Details"
              size="small"
              sx={{ bgcolor: ACCENT_SOFT, color: ACCENT_DARK, fontWeight: 600 }}
            />
          </Divider>
          <Typography variant="caption" color="text.secondary" display="block" mb={1}>
            This dealer/supplier&apos;s own bank account - a reference for NEFT/RTGS, so it&apos;s clear
            which account money should go to or came from. This is separate from your own
            Cash/Bank ledger, which is chosen per voucher when a payment is actually posted.
          </Typography>
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            size="small"
            label="Account Holder Name"
            value={form.bankAccountHolderName}
            onChange={(e) => setForm({ ...form, bankAccountHolderName: e.target.value })}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            size="small"
            label="Bank Name"
            value={form.bankName}
            onChange={(e) => setForm({ ...form, bankName: e.target.value })}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            size="small"
            label="Account Number"
            value={form.bankAccountNumber}
            onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            size="small"
            label="IFSC Code"
            value={form.bankIfscCode}
            onChange={(e) => setForm({ ...form, bankIfscCode: e.target.value.toUpperCase() })}
          />
        </Grid>
      </Grid>
    )}

    {tab === 3 && (
      <Grid container spacing={1.75}>
        <Grid item xs={12}>
          <TextField
            fullWidth
            size="small"
            label="Business Nature"
            value={form.businessNature}
            onChange={(e) =>
              setForm({ ...form, businessNature: e.target.value })
            }
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            multiline
            rows={3}
            size="small"
            label="Remarks"
            value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
          />
        </Grid>

        <Grid item xs={12}>
          <Typography variant="caption" color="text.secondary">
            Document uploads (GST Certificate, PAN Card, Address Proof, Bank
            Proof, Others) can be attached after saving via the generic upload
            endpoint - see backend README.
          </Typography>
        </Grid>
      </Grid>
    )}
  </Box>
</DrawerShell>

      {/* ---------- Dealer 360: Statement + Aging + History - right-anchored drawer ---------- */}
      <DrawerShell
        open={!!statementTarget}
        onClose={() => setStatementTarget(null)}
        width={{ xs: "100%", sm: 720 }}
        header={
          <>
            <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{statementTarget?.name} - Dealer 360</Typography>
            <Box display="flex" alignItems="center" gap={1} mt={0.5} flexWrap="wrap">
              <Typography variant="body2" color="text.secondary">{statementTarget?.dealerCode} · Credit Limit</Typography>
              {editingCreditLimit ? (
                <>
                  <TextField size="small" type="number" value={creditLimitDraft} sx={{ width: 130, "& .MuiInputBase-root": { fontSize: 13, bgcolor: "#fff" }, "& .MuiOutlinedInput-root.Mui-focused fieldset": { borderColor: ACCENT } }}
                    onChange={(e) => setCreditLimitDraft(e.target.value)} />
                  <Button size="small" variant="contained" disabled={savingCreditLimit} onClick={saveCreditLimit} sx={{ ...greenBtnSx, px: 1.5 }}>Save</Button>
                  <Button size="small" onClick={() => setEditingCreditLimit(false)} disabled={savingCreditLimit} sx={ghostBtnSx}>Cancel</Button>
                </>
              ) : (
                <>
                  <Typography variant="body2" color="text.secondary" fontWeight={600}>
                    ₹{statementTarget?.creditLimit?.toLocaleString("en-IN") || 0}
                  </Typography>
                  <Tooltip title="Increase / change credit limit">
                    <IconButton size="small" onClick={() => setEditingCreditLimit(true)} sx={{ color: ACCENT }}><EditIcon fontSize="inherit" /></IconButton>
                  </Tooltip>
                </>
              )}
            </Box>
            {statement?.summary && (
              <Box pt={1} display="flex" gap={0.75} flexWrap="wrap">
                <Chip size="small" label={`Opening ₹${statement.summary.openingBalance.toLocaleString("en-IN")}`} sx={{ fontWeight: 600 }} />
                <Chip size="small" color="info" label={`Sales ₹${statement.summary.totalSales.toLocaleString("en-IN")}`} sx={{ fontWeight: 600 }} />
                <Chip size="small" color="success" label={`Receipts ₹${statement.summary.totalReceipts.toLocaleString("en-IN")}`} sx={{ fontWeight: 600 }} />
                <Chip size="small" color="primary" label={`Outstanding ₹${statement.summary.currentOutstanding.toLocaleString("en-IN")}`} sx={{ fontWeight: 600 }} />
                {statement.summary.overdueAmount !== undefined && (
                  <Chip size="small" color={statement.summary.overdueAmount > 0 ? "error" : "success"} label={`Overdue ₹${statement.summary.overdueAmount.toLocaleString("en-IN")}`} sx={{ fontWeight: 600 }} />
                )}
              </Box>
            )}
            {statementTarget?.bankAccountNumber && (
              <Typography variant="caption" color="text.secondary" display="block" pt={0.75}>
                Bank: {statementTarget.bankName || "-"} · A/c {statementTarget.bankAccountNumber}
                {statementTarget.bankIfscCode ? ` · IFSC ${statementTarget.bankIfscCode}` : ""}
                {statementTarget.bankAccountHolderName ? ` · ${statementTarget.bankAccountHolderName}` : ""}
              </Typography>
            )}
          </>
        }
        tabsBar={
          <Tabs value={dealer360Tab} onChange={(_, v) => setDealer360Tab(v)} variant="scrollable" scrollButtons="auto" sx={tabsSx}>
            <Tab label="Ledger" />
            <Tab label={statementTarget?.entityType === "dealer" ? "Aging (Receivable)" : "Aging (Payable)"} />
            <Tab label="History" />
          </Tabs>
        }
        footer={<Button onClick={() => setStatementTarget(null)} sx={ghostBtnSx}>Close</Button>}
      >
        <Box sx={drawerTablesSx}>
          {dealer360Tab === 0 && (
            <TableContainer sx={scrollbarSx}>
              <Table size="small">
                <TableHead>
                  <TableRow><TableCell>Date</TableCell><TableCell>Type</TableCell><TableCell>Reference</TableCell><TableCell>Description</TableCell><TableCell align="right">Amount</TableCell><TableCell align="right">Running Balance</TableCell></TableRow>
                </TableHead>
                <TableBody>
                  {statement?.events.map((e, i) => (
                    <TableRow key={i} hover>
                      <TableCell>{new Date(e.date).toLocaleDateString("en-IN")}</TableCell>
                      <TableCell><Chip size="small" color={eventColor[e.type] || "default"} label={e.type.replace("_", " ")} sx={{ ...miniChipSx, textTransform: "capitalize" }} /></TableCell>
                      <TableCell>{e.reference}</TableCell>
                      <TableCell>{e.description}</TableCell>
                      <TableCell align="right">{e.drCr === "debit" ? "+" : "-"}₹{e.amount.toLocaleString("en-IN")}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>₹{e.runningBalance.toLocaleString("en-IN")}</TableCell>
                    </TableRow>
                  ))}
                  {(!statement || statement.events.length === 0) && (
                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: "text.secondary" }}>{statementLoading ? "Loading..." : "No transactions yet for this ledger"}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {dealer360Tab === 1 && (
            <>
              <Box display="flex" gap={1} flexWrap="wrap" mb={2}>
                {aging && Object.entries(aging.buckets).map(([bucket, amount]) => (
                  <Chip key={bucket} size="small" color={AGING_BUCKET_COLOR[bucket]} label={`${bucket}: ₹${amount.toLocaleString("en-IN")}`} sx={{ fontWeight: 600 }} />
                ))}
              </Box>
              <TableContainer sx={scrollbarSx}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{statementTarget?.entityType === "dealer" ? "Invoice" : "Bill"}</TableCell><TableCell>Date</TableCell><TableCell>Due Date</TableCell>
                      <TableCell align="right">Amount</TableCell><TableCell align="right">Received</TableCell>
                      <TableCell align="right">Outstanding</TableCell><TableCell align="right">Days</TableCell><TableCell>Aging</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {aging?.invoices.map((inv, i) => (
                      <TableRow key={i} hover>
                        <TableCell>{inv.billNumber}</TableCell>
                        <TableCell>{new Date(inv.date).toLocaleDateString("en-IN")}</TableCell>
                        <TableCell>{new Date(inv.dueDate).toLocaleDateString("en-IN")}</TableCell>
                        <TableCell align="right">₹{inv.amount.toLocaleString("en-IN")}</TableCell>
                        <TableCell align="right">₹{inv.received.toLocaleString("en-IN")}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>₹{inv.outstandingAmount.toLocaleString("en-IN")}</TableCell>
                        <TableCell align="right">{inv.daysOverdue > 0 ? inv.daysOverdue : "-"}</TableCell>
                        <TableCell><Chip size="small" color={AGING_BUCKET_COLOR[inv.bucket]} label={inv.bucket} sx={miniChipSx} /></TableCell>
                      </TableRow>
                    ))}
                    {(!aging || aging.invoices.length === 0) && (
                      <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4, color: "text.secondary" }}>{statementLoading ? "Loading..." : "No open invoices"}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          {dealer360Tab === 2 && (
            <>
              <Typography variant="subtitle2" fontWeight={700} mb={1} sx={{ color: ACCENT_DARK }}>Salesman Assignment History</Typography>
              <TableContainer sx={{ mb: 3, ...scrollbarSx }}>
                <Table size="small">
                  <TableHead>
                    <TableRow><TableCell>Salesman</TableCell><TableCell>From</TableCell><TableCell>To</TableCell><TableCell>Status</TableCell></TableRow>
                  </TableHead>
                  <TableBody>
                    {dealerHistory?.salesmanHistory.map((h, i) => (
                      <TableRow key={i} hover>
                        <TableCell>{h.salesman?.name || "Unassigned"}</TableCell>
                        <TableCell>{new Date(h.assignedFrom).toLocaleDateString("en-IN")}</TableCell>
                        <TableCell>{h.assignedTo ? new Date(h.assignedTo).toLocaleDateString("en-IN") : "-"}</TableCell>
                        <TableCell>{!h.assignedTo && <Chip size="small" color="success" label="Current" sx={miniChipSx} />}</TableCell>
                      </TableRow>
                    ))}
                    {(!dealerHistory || dealerHistory.salesmanHistory.length === 0) && (
                      <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3, color: "text.secondary" }}>{statementLoading ? "Loading..." : "No salesman ever assigned"}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <Typography variant="subtitle2" fontWeight={700} mb={1} sx={{ color: ACCENT_DARK }}>Collections</Typography>
              <Box display="flex" gap={1} flexWrap="wrap" mb={1.25}>
                <Chip size="small" color="warning" label={`Pending ₹${(dealerHistory?.collectionsSummary.pending_approval || 0).toLocaleString("en-IN")}`} sx={{ fontWeight: 600 }} />
                <Chip size="small" color="success" label={`Approved ₹${(dealerHistory?.collectionsSummary.approved || 0).toLocaleString("en-IN")}`} sx={{ fontWeight: 600 }} />
                <Chip size="small" color="error" label={`Rejected ₹${(dealerHistory?.collectionsSummary.rejected || 0).toLocaleString("en-IN")}`} sx={{ fontWeight: 600 }} />
              </Box>
              <TableContainer sx={{ mb: 3, ...scrollbarSx }}>
                <Table size="small">
                  <TableHead>
                    <TableRow><TableCell>Date</TableCell><TableCell>Salesman</TableCell><TableCell align="right">Amount</TableCell><TableCell>Mode</TableCell><TableCell>Status</TableCell></TableRow>
                  </TableHead>
                  <TableBody>
                    {dealerHistory?.collections.slice(0, 10).map((c) => (
                      <TableRow key={c._id} hover>
                        <TableCell>{new Date(c.date).toLocaleDateString("en-IN")}</TableCell>
                        <TableCell>{c.salesman?.name || "-"}</TableCell>
                        <TableCell align="right">₹{c.amount.toLocaleString("en-IN")}</TableCell>
                        <TableCell><Chip size="small" label={c.paymentMode?.replace("_", " ")} sx={{ ...miniChipSx, textTransform: "capitalize" }} /></TableCell>
                        <TableCell><Chip size="small" color={collectionStatusColor[c.status]} label={c.status.replace("_", " ")} sx={{ ...miniChipSx, textTransform: "capitalize" }} /></TableCell>
                      </TableRow>
                    ))}
                    {(!dealerHistory || dealerHistory.collections.length === 0) && (
                      <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3, color: "text.secondary" }}>{statementLoading ? "Loading..." : "No collections logged yet"}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <Typography variant="subtitle2" fontWeight={700} mb={1} sx={{ color: ACCENT_DARK }}>Items Bought (all-time)</Typography>
              <TableContainer sx={{ mb: 3, ...scrollbarSx }}>
                <Table size="small">
                  <TableHead>
                    <TableRow><TableCell>Item</TableCell><TableCell align="right">Quantity</TableCell><TableCell align="right">Amount</TableCell></TableRow>
                  </TableHead>
                  <TableBody>
                    {dealerHistory?.itemsSummary.map((it, i) => (
                      <TableRow key={i} hover>
                        <TableCell>{it.name}</TableCell>
                        <TableCell align="right">{it.totalQty} {it.unit}</TableCell>
                        <TableCell align="right">₹{it.totalAmount.toLocaleString("en-IN")}</TableCell>
                      </TableRow>
                    ))}
                    {(!dealerHistory || dealerHistory.itemsSummary.length === 0) && (
                      <TableRow><TableCell colSpan={3} align="center" sx={{ py: 3, color: "text.secondary" }}>{statementLoading ? "Loading..." : "Nothing bought yet"}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <Typography variant="subtitle2" fontWeight={700} mb={1} sx={{ color: ACCENT_DARK }}>Recent Visits</Typography>
              <TableContainer sx={scrollbarSx}>
                <Table size="small">
                  <TableHead>
                    <TableRow><TableCell>Date</TableCell><TableCell>Salesman</TableCell><TableCell>Remarks</TableCell></TableRow>
                  </TableHead>
                  <TableBody>
                    {dealerHistory?.visits.map((v) => (
                      <TableRow key={v._id} hover>
                        <TableCell>{new Date(v.visitTime).toLocaleString("en-IN")}</TableCell>
                        <TableCell>{v.salesman?.name || "-"}</TableCell>
                        <TableCell>{v.remarks || "-"}</TableCell>
                      </TableRow>
                    ))}
                    {(!dealerHistory || dealerHistory.visits.length === 0) && (
                      <TableRow><TableCell colSpan={3} align="center" sx={{ py: 3, color: "text.secondary" }}>{statementLoading ? "Loading..." : "No visits logged yet"}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Box>
      </DrawerShell>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Ledger?"
        message={`This will permanently delete "${deleteTarget?.name}". This cannot be undone.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <Dialog open={newGroupOpen} onClose={() => setNewGroupOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New Account Group</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Create your own account group to put this (or any other) ledger under - it's
            immediately available everywhere else a group can be picked.
          </Typography>
          <TextField fullWidth size="small" label="Group Name *" autoFocus sx={{ mb: 2 }}
            value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
          <TextField select fullWidth size="small" label="Nature *" value={newGroupNature}
            onChange={(e) => setNewGroupNature(e.target.value)}>
            <MenuItem value="asset">Asset</MenuItem>
            <MenuItem value="liability">Liability</MenuItem>
            <MenuItem value="income">Income</MenuItem>
            <MenuItem value="expense">Expense</MenuItem>
            <MenuItem value="equity">Equity</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewGroupOpen(false)} disabled={savingGroup}>Cancel</Button>
          <Button variant="contained" disabled={savingGroup || !newGroupName} onClick={handleCreateGroup}>
            {savingGroup ? "Creating..." : "Create Group"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}