"use client";

import { useEffect, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import {
  Typography, Box, Grid, TextField, MenuItem, Button, Table, TableHead,
  TableRow, TableCell, TableBody, Paper, TableContainer, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Stepper, Step, StepLabel,
  Divider, Tooltip, InputAdornment, LinearProgress,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import RefreshIcon from "@mui/icons-material/Refresh";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import CloseIcon from "@mui/icons-material/Close";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import FactoryIcon from "@mui/icons-material/Factory";
import AssignmentIcon from "@mui/icons-material/Assignment";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import DonutLargeIcon from "@mui/icons-material/DonutLarge";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import LayersIcon from "@mui/icons-material/Layers";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import api from "@/lib/api";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useSnackbar } from "@/components/SnackbarProvider";

interface Item { _id: string; name: string; unit: string; productCode?: string; }
interface WOLine {
  item: Item; plannedQty: number; producedQty: number; scrapQty: number;
  length?: number; width?: number; thickness?: number; density?: number; unit?: string;
  variant?: { _id: string; sizeLabel: string };
}
interface StageEvent { stage: string; changedBy?: { name: string }; changedAt: string; remarks?: string; }
interface WorkOrder {
  _id: string; workOrderNumber: string; items: WOLine[]; currentStage: string;
  stageHistory: StageEvent[]; scheduledDate: string; completedDate?: string;
  // Very old work orders (predating the multi-model `items` array) stored a single item/qty
  // directly on the work order itself - `items` is empty for these. Kept only so the list
  // still shows something meaningful for them instead of a blank Models cell.
  item?: string; plannedQty?: number;
}

// ---------- Theme tokens (saare colors yahin se - ek jagah badlo, poora page badlega) ----------
const T = {
  green: "#2e7d32",
  greenDark: "#1b5e20",
  greenHover: "#14451a",
  greenLight: "#e8f5e9",
  greenSelectedBg: "#f3faf4",
  ink: "#14281b",
  border: "#e3ebe4",
  rowBorder: "#edf1ed",
  headBg: "#eef4ee",
  headText: "#2c3e34",
  red: "#d32f2f",
  redLight: "#ffebee",
  blue: "#1976d2",
  blueLight: "#e3f2fd",
  grey: "#546e7a",
  greyLight: "#eceff1",
  shadow: "0 1px 3px rgba(20,40,27,0.06)",
  shadowHover: "0 4px 14px rgba(20,40,27,0.10)",
};

const cardSx = { borderRadius: 3, borderColor: T.border, boxShadow: T.shadow, bgcolor: "#fff" } as const;

const STAGE_LABELS: Record<string, string> = {
  planned: "Planned Qty", raw_material_verification: "Raw Material Verification",
  pasting: "Pasting", stitching: "Stitching", packing: "Packing", ready_to_dispatch: "Ready to Dispatch",
  cancelled: "Cancelled",
};
const STAGE_ORDER = ["planned", "raw_material_verification", "pasting", "stitching", "packing", "ready_to_dispatch"];

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";

// Stage chip look (soft tinted pill + icon)
const STAGE_STYLE: Record<string, { bg: string; fg: string; icon: ReactElement }> = {
  planned: { bg: T.greyLight, fg: T.grey, icon: <DonutLargeIcon sx={{ fontSize: 16 }} /> },
  raw_material_verification: { bg: T.blueLight, fg: T.blue, icon: <DescriptionOutlinedIcon sx={{ fontSize: 16 }} /> },
  pasting: { bg: T.blueLight, fg: T.blue, icon: <LayersIcon sx={{ fontSize: 16 }} /> },
  stitching: { bg: T.blueLight, fg: T.blue, icon: <ContentCutIcon sx={{ fontSize: 16 }} /> },
  packing: { bg: T.greenLight, fg: T.green, icon: <Inventory2OutlinedIcon sx={{ fontSize: 16 }} /> },
  ready_to_dispatch: { bg: T.greenLight, fg: T.green, icon: <LocalShippingOutlinedIcon sx={{ fontSize: 16 }} /> },
  cancelled: { bg: T.redLight, fg: T.red, icon: <CancelIcon sx={{ fontSize: 16 }} /> },
};

function StageChip({ stage }: { stage: string }) {
  const st = STAGE_STYLE[stage] ?? STAGE_STYLE.planned;

  return (
    <Chip
      size="small"
      icon={st.icon}
      label={STAGE_LABELS[stage] ?? stage}
      sx={{
        bgcolor: st.bg,
        color: st.fg,
        fontWeight: 600,
        height: 26,
        maxWidth: "100%",
        "& .MuiChip-icon": {
          color: "inherit",
        },
      }}
    />
  );
}

// Shared dialog header: green bar + close button
function DialogHeader({ title, onClose }: { title: ReactNode; onClose: () => void }) {
  return (
    <DialogTitle sx={{ bgcolor: T.green, color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", py: 1.5, fontSize: 18, fontWeight: 700 }}>
      {title}
      <IconButton size="small" aria-label="close" onClick={onClose} sx={{ color: "#fff" }}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </DialogTitle>
  );
}

const sectionLabelSx = { color: T.greenDark, fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 } as const;

const WEEK = 7 * 24 * 60 * 60 * 1000;

export default function ProductionPage() {
  const { showMessage } = useSnackbar();
  const [items, setItems] = useState<Item[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [form, setForm] = useState({ workOrderNumber: "", scheduledDate: new Date().toISOString().slice(0, 10) });
  const emptyLine = { item: "", plannedQty: "", length: "", width: "", thickness: "", density: "" };
  const [lines, setLines] = useState<typeof emptyLine[]>([{ ...emptyLine }]);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [produceDialogWO, setProduceDialogWO] = useState<WorkOrder | null>(null);
  // Keyed by LINE INDEX, not item id - a work order can have the same item on multiple lines
  // at different sizes (see models/WorkOrder.js's per-line `variant`); keying by item id
  // alone made every size of the same item share one input, so typing a quantity for one
  // size silently overwrote what was shown for every other size of that item.
  const [produceValues, setProduceValues] = useState<Record<number, { producedQty: string; scrapQty: string }>>({});
  const [viewWO, setViewWO] = useState<WorkOrder | null>(null);
  const [cancelTarget, setCancelTarget] = useState<WorkOrder | null>(null);

  // ---- list UI state (search / filter / pagination / loading) ----
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    // allSettled, not all - these two are independent, and Promise.all would let ONE
    // failing/slow request wipe out data that DID load successfully, since neither setter
    // would run at all (same bug already fixed in Sales/Purchase/Accounts/Salesman - see the
    // matching note in sales/page.tsx's loadData). This is what made the Work Order table
    // appear to not show at all.
    const [itemRes, woRes] = await Promise.allSettled([
      api.get("/masters/items"),
      api.get("/production/work-orders"),
    ]);
    if (itemRes.status === "fulfilled") setItems(itemRes.value.data);
    if (woRes.status === "fulfilled") setOrders(woRes.value.data);
  };

  useEffect(() => { loadData().finally(() => setLoading(false)); }, []);
  useEffect(() => { setPage(0); }, [search, stageFilter, rowsPerPage]);

  const handleRefresh = async () => {
    setLoading(true);
    try { await loadData(); } finally { setLoading(false); }
  };

  const addLine = () => setLines((prev) => [...prev, { ...emptyLine }]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));
  const updateLine = (idx: number, patch: Partial<typeof emptyLine>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const handleCreate = async () => {
    setSaving(true);
    try {
      await api.post("/production/work-orders", {
        ...form,
        items: lines.map((l) => ({
          item: l.item, plannedQty: Number(l.plannedQty),
          length: l.length || undefined, width: l.width || undefined,
          thickness: l.thickness || undefined, density: l.density || undefined,
        })),
      });
      showMessage("Work order created", "success");
      setForm({ workOrderNumber: "", scheduledDate: new Date().toISOString().slice(0, 10) });
      setLines([{ ...emptyLine }]);
      setCreateOpen(false);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  // Advance a work order one stage. For the FINAL transition (packing -> ready_to_dispatch),
  // open a dialog first to collect actual produced/scrap qty per model.
  const handleAdvance = async (wo: WorkOrder) => {
    const idx = STAGE_ORDER.indexOf(wo.currentStage);
    const nextStage = STAGE_ORDER[idx + 1];
    if (nextStage === "ready_to_dispatch") {
      const initial: Record<number, { producedQty: string; scrapQty: string }> = {};
      wo.items.forEach((l, idx) => { initial[idx] = { producedQty: String(l.plannedQty), scrapQty: "0" }; });
      setProduceValues(initial);
      setProduceDialogWO(wo);
      return;
    }
    await api.post(`/production/work-orders/${wo._id}/advance-stage`, {});
    showMessage(`Moved to ${STAGE_LABELS[nextStage]}`, "success");
    await loadData();
  };

  const confirmFinalStage = async () => {
    if (!produceDialogWO) return;
    setSaving(true);
    try {
      await api.post(`/production/work-orders/${produceDialogWO._id}/advance-stage`, {
        // Sent in the SAME order as produceDialogWO.items - the backend pairs this array with
        // the work order's lines BY POSITION, not by item id (see workOrderController.
        // advanceStage), so this order must never change between fetch and submit.
        itemsProduced: produceDialogWO.items.map((l, idx) => ({
          item: l.item._id,
          producedQty: Number(produceValues[idx]?.producedQty || 0),
          scrapQty: Number(produceValues[idx]?.scrapQty || 0),
        })),
      });
      showMessage("Production complete - stock updated", "success");
      setProduceDialogWO(null);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    await api.post(`/production/work-orders/${cancelTarget._id}/cancel`, {});
    showMessage("Work order cancelled", "success");
    setCancelTarget(null);
    await loadData();
  };

  const canCreate = form.workOrderNumber && lines.every((l) => l.item && Number(l.plannedQty) > 0);

  // ---- derived UI data ----
  const isActive = (s: string) => s !== "ready_to_dispatch" && s !== "cancelled";
  const stats = {
    total: orders.length,
    active: orders.filter((o) => isActive(o.currentStage)).length,
    ready: orders.filter((o) => o.currentStage === "ready_to_dispatch").length,
    cancelled: orders.filter((o) => o.currentStage === "cancelled").length,
  };

  // "from last week" trend: pichle 7 din ke work orders (scheduledDate se) vs usse pehle ke 7 din.
  // Pichle hafte me kuch nahi tha to % nahi dikhata (divide by zero se bachne ke liye).
  const weekTrend = (match: (o: WorkOrder) => boolean): number | null => {
    const now = Date.now();
    const inRange = (o: WorkOrder, from: number, to: number) => {
      const t = new Date(o.scheduledDate).getTime();
      return t >= from && t < to;
    };
    const cur = orders.filter((o) => match(o) && inRange(o, now - WEEK, now + 1)).length;
    const prev = orders.filter((o) => match(o) && inRange(o, now - 2 * WEEK, now - WEEK)).length;
    return prev === 0 ? null : Math.round(((cur - prev) / prev) * 100);
  };

  const filtered = orders.filter((wo) => {
    if (stageFilter === "active" && !isActive(wo.currentStage)) return false;
    if (stageFilter !== "all" && stageFilter !== "active" && wo.currentStage !== stageFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      wo.workOrderNumber.toLowerCase().includes(q) ||
      wo.items.some((l) => l.item?.name?.toLowerCase().includes(q))
    );
  });
  const pageRows = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const statCards = [
    { label: "Total Work Orders", value: stats.total, filter: "all", color: T.green, tint: T.greenLight, icon: <AssignmentIcon />, trend: weekTrend(() => true) },
    { label: "In Progress", value: stats.active, filter: "active", color: T.green, tint: T.greenLight, icon: <PlayCircleIcon />, trend: weekTrend((o) => isActive(o.currentStage)) },
    { label: "Completed", value: stats.ready, filter: "ready_to_dispatch", color: T.green, tint: T.greenLight, icon: <CheckCircleIcon />, trend: weekTrend((o) => o.currentStage === "ready_to_dispatch") },
    { label: "Cancelled", value: stats.cancelled, filter: "cancelled", color: T.red, tint: T.redLight, icon: <CancelIcon />, trend: weekTrend((o) => o.currentStage === "cancelled") },
  ];

  // pagination (custom, numbered)
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const pageStart = Math.max(0, Math.min(page - 1, totalPages - 3));
  const pageNumbers = Array.from({ length: Math.min(3, totalPages) }, (_, i) => pageStart + i);

  return (
    // Simple column: content apni natural height leta hai, <main> (layout) scroll karta hai.
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {/* ---------- Page header ---------- */}

<Box
  sx={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 1.5,
    flexWrap: "wrap",
    mb: 0.5,
  }}
>
  {/* Page title */}
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 1.25,
      minWidth: 0,
    }}
  >
    <Box
      sx={{
        width: 40,
        height: 40,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: 1,
        borderColor: "rgba(46,125,50,0.20)",
        bgcolor: "rgba(46,125,50,0.07)",
        borderRadius: 1.5,
      }}
    >
      <FactoryIcon
        sx={{
          fontSize: 22,
          color: T.greenDark,
        }}
      />
    </Box>

    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="h5"
        sx={{
          color: T.ink,
          fontSize: 21,
          fontWeight: 750,
          lineHeight: 1.3,
          letterSpacing: "-0.35px",
        }}
      >
        Production
      </Typography>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          mt: 0.25,
          fontSize: 12.5,
          lineHeight: 1.5,
        }}
      >
        Manage work orders and track production stages.
      </Typography>
    </Box>
  </Box>

  {/* Create work order */}
  <Button
    variant="contained"
    disableElevation
    startIcon={<AddIcon sx={{ fontSize: 18 }} />}
    onClick={() => setCreateOpen(true)}
    sx={{
      minHeight: 35,
      px: 1.75,
      py: 0.5,
      borderRadius: 1,
      bgcolor: T.greenDark,
      color: "#fff",
      fontSize: 12.5,
      fontWeight: 650,
      textTransform: "none",
      whiteSpace: "nowrap",
      "& .MuiButton-startIcon": {
        mr: 0.75,
      },
      "&:hover": {
        bgcolor: T.greenHover,
      },
    }}
  >
    New Work Order
  </Button>
</Box>


      {/* ---------- Stat cards (click karke filter lag jata hai) ---------- */}
      <Grid container spacing={1.5}>
        {statCards.map((c) => {
          const selected = stageFilter === c.filter;
          return (
            <Grid item xs={6} md={3} key={c.label}>
              <Paper
                onClick={() => setStageFilter(c.filter)}
                variant="outlined"
                sx={{
                  ...cardSx, px: 2, py: 1.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 2,
                  bgcolor: selected ? T.greenSelectedBg : "#fff", borderColor: selected ? T.green : T.border,
                  transition: "all .2s", "&:hover": { boxShadow: T.shadowHover },
                }}
              >
                <Box sx={{
                  width: 44, height: 44, borderRadius: "50%", bgcolor: c.tint, color: c.color,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {c.icon}
                </Box>
                <Box minWidth={0}>
                  <Typography variant="body2" color="text.secondary" noWrap>{c.label}</Typography>
                  <Typography variant="h5" fontWeight={800} lineHeight={1.2} sx={{ color: T.ink }}>{c.value}</Typography>
                  {c.trend !== null && (
                    <Box display="flex" alignItems="center" gap={0.25} sx={{ color: c.trend >= 0 ? T.green : T.red }}>
                      {c.trend >= 0 ? <ArrowUpwardIcon sx={{ fontSize: 14 }} /> : <ArrowDownwardIcon sx={{ fontSize: 14 }} />}
                      <Typography variant="caption" fontWeight={600} noWrap sx={{ color: "inherit" }}>
                        {Math.abs(c.trend)}% from last week
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      {/* ---------- Filter bar ---------- */}
 
<Paper
  variant="outlined"
  sx={{
    ...cardSx,
    p: 1.25,
    display: "flex",
    alignItems: "center",
    gap: 1,
    flexWrap: "wrap",
    borderRadius: 1.5,
    borderColor: T.rowBorder,
    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
  }}
>

  

  {/* Results count */}
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 0.75,
      ml: { xs: 0, sm: "auto" },
      whiteSpace: "nowrap",
      minHeight: 30,
    }}
  >
    <Box
      sx={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        bgcolor: T.green,
      }}
    />

    <Typography
      variant="body2"
      color="text.secondary"
      sx={{ fontSize: 12 }}
    >
      <Box
        component="span"
        sx={{ color: "text.primary", fontWeight: 700 }}
      >
        {filtered.length}
      </Box>{" "}
      work order{filtered.length === 1 ? "" : "s"}
    </Typography>
  </Box>

  
  {/* Spacer */}
  <Box sx={{ flex: "1 1 12px" }} />
  {/* Search */}
  <TextField
    size="small"
    placeholder="Search WO number or model..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    InputProps={{
      startAdornment: (
        <InputAdornment position="start">
          <SearchIcon sx={{ fontSize: 18, color: "text.secondary" }} />
        </InputAdornment>
      ),
    }}
    sx={{
      flex: { xs: "1 1 100%", sm: "1 1 240px", md: "0 1 290px" },
      minWidth: { xs: "100%", sm: 220 },
      "& .MuiOutlinedInput-root": {
        height: 34,
        borderRadius: 1,
        bgcolor: "background.paper",
        fontSize: 12.5,
      },
      "& .MuiOutlinedInput-input": {
        py: 0.75,
      },
    }}
  />

  {/* Stage filter */}
  <TextField
    select
    size="small"
    value={stageFilter}
    onChange={(e) => setStageFilter(e.target.value)}
    sx={{
      flex: { xs: "1 1 100%", sm: "0 1 200px" },
      minWidth: { xs: "100%", sm: 180 },
      "& .MuiOutlinedInput-root": {
        height: 34,
        borderRadius: 1,
        bgcolor: "background.paper",
        fontSize: 12.5,
      },
      "& .MuiSelect-select": {
        py: 0.75,
      },
    }}
  >
    <MenuItem value="all">All stages</MenuItem>
    <MenuItem value="active">In progress (all active)</MenuItem>
    {[...STAGE_ORDER, "cancelled"].map((sg) => (
      <MenuItem key={sg} value={sg} sx={{ fontSize: 12.5 }}>
        {STAGE_LABELS[sg]}
      </MenuItem>
    ))}
  </TextField>

  {/* Clear filters */}
  <Button
    variant="outlined"
    color="inherit"
    startIcon={<FilterAltOffOutlinedIcon sx={{ fontSize: 16 }} />}
    onClick={() => {
      setSearch("");
      setStageFilter("all");
    }}
    sx={{
      height: 34,
      px: 1.25,
      borderRadius: 1,
      borderColor: "divider",
      color: "text.secondary",
      bgcolor: "background.paper",
      textTransform: "none",
      fontSize: 12,
      fontWeight: 600,
      whiteSpace: "nowrap",
      "& .MuiButton-startIcon": {
        mr: 0.5,
      },
      "&:hover": {
        bgcolor: "action.hover",
        borderColor: "text.secondary",
      },
    }}
  >
    Clear
  </Button>

  {/* Refresh */}
  <Tooltip title="Refresh work orders">
    <span>
      <IconButton
        aria-label="Refresh work orders"
        onClick={handleRefresh}
        disabled={loading}
        size="small"
        sx={{
          width: 34,
          height: 34,
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          color: "text.secondary",
          bgcolor: "background.paper",
          "&:hover": {
            color: T.greenDark,
            bgcolor: T.greenLight,
            borderColor: T.green,
          },
        }}
      >
        <RefreshIcon sx={{ fontSize: 18 }} />
      </IconButton>
    </span>
  </Tooltip>

</Paper>


      {/* ---------- Table card ---------- */}
  
<Paper
  variant="outlined"
  sx={{
    ...cardSx,
    overflow: "hidden",
    borderRadius: 1.5,
    borderColor: T.rowBorder,
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  }}
>
  {loading && (
    <LinearProgress
      color="success"
      sx={{ height: 2 }}
    />
  )}

  <TableContainer sx={{ overflowX: "auto" }}>
    <Table
      size="small"
      sx={{
        tableLayout: "fixed",
        minWidth: 900,

        "& .MuiTableCell-root": {
          px: 1.5,
          py: 0.75,
          borderColor: T.rowBorder,
          verticalAlign: "middle",
        },

        "& .MuiTableCell-head": {
          bgcolor: T.headBg,
          color: T.headText,
          fontWeight: 700,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.35,
          whiteSpace: "nowrap",
          py: 1,
        },

        "& .MuiTableCell-body": {
          fontSize: 12.5,
        },

        "& .MuiTableRow-root:last-child .MuiTableCell-root": {
          borderBottom: 0,
        },

        "& .MuiTableBody-root .MuiTableRow-root:hover": {
          bgcolor: T.greenLight,
        },
      }}
    >
      <TableHead>
 <TableRow
    sx={{
      "& .MuiTableCell-root": {
        bgcolor: T.greenDark,
        color: "#FFFFFF",
        fontWeight: 700,
        fontSize: 11.5,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        borderColor: T.greenDark,
        py: 1.1,
      },
    }}
  >
          <TableCell sx={{ width: 115 }}>WO Number</TableCell>
          <TableCell sx={{ width: 115 }}>Scheduled</TableCell>
          <TableCell>Work / Models</TableCell>
          <TableCell sx={{ width: 180 }}>Stage</TableCell>
          <TableCell sx={{ width: 255 }}>Actions</TableCell>
        </TableRow>
      </TableHead>

      <TableBody>
        {pageRows.map((wo) => {
          const stageIdx = STAGE_ORDER.indexOf(wo.currentStage);
          const nextLabel = STAGE_LABELS[STAGE_ORDER[stageIdx + 1]];
          const active = isActive(wo.currentStage);
          const hasItems = wo.items.length > 0;

          const modelNames = hasItems
            ? wo.items
                .map(
                  (l) =>
                    `${l.item?.name ?? "Unnamed item"}${
                      l.variant &&
                      !l.variant.sizeLabel.startsWith("Unspecified")
                        ? ` [${l.variant.sizeLabel}]`
                        : ""
                    }`
                )
                .join(", ")
            : wo.item
              ? "Legacy record"
              : "-";

          const totalPcs = hasItems
            ? wo.items.reduce(
                (sum, l) => sum + (Number(l.plannedQty) || 0),
                0
              )
            : wo.plannedQty ?? 0;

          const subText = hasItems
            ? `${wo.items.length} model${wo.items.length === 1 ? "" : "s"} · ${totalPcs} pcs`
            : wo.item
              ? `${totalPcs} pcs`
              : "";

          return (
            <TableRow
              key={wo._id}
              hover
              sx={{
                height: 52,
                transition: "background-color 120ms ease",
                "&:last-child td": { borderBottom: 0 },
              }}
            >
              {/* Work order number */}
              <TableCell>
                <Typography
                  variant="body2"
                  fontWeight={700}
                  noWrap
                  sx={{ color: T.greenDark, fontSize: 12.5 }}
                >
                  {wo.workOrderNumber}
                </Typography>
              </TableCell>

              {/* Scheduled date */}
              <TableCell>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  noWrap
                  sx={{ fontSize: 12 }}
                >
                  {fmtDate(wo.scheduledDate)}
                </Typography>
              </TableCell>

              {/* Models and quantity */}
              <TableCell>
                <Tooltip
                  title={modelNames}
                  placement="top-start"
                  enterDelay={400}
                >
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    noWrap
                    sx={{
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      cursor: "default",
                    }}
                  >
                    {modelNames}
                  </Typography>
                </Tooltip>

                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  noWrap
                  sx={{ fontSize: 11, lineHeight: 1.4 }}
                >
                  {subText || "\u00A0"}
                </Typography>
              </TableCell>

              {/* Current stage */}
              <TableCell>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    minWidth: 0,
                    "& > *": { maxWidth: "100%" },
                  }}
                >
                  <StageChip stage={wo.currentStage} />
                </Box>
              </TableCell>

              {/* Actions */}
              <TableCell>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    whiteSpace: "nowrap",
                  }}
                >
                  <Tooltip
                    title={
                      active
                        ? `Advance to ${nextLabel}`
                        : wo.currentStage === "cancelled"
                          ? "Work order cancelled"
                          : "Already at final stage"
                    }
                  >
                    <span>
                      <Button
                        size="small"
                        variant="contained"
                        disableElevation
                        endIcon={<ArrowForwardIcon />}
                        disabled={!active}
                        onClick={() => handleAdvance(wo)}
                        sx={{
                          minWidth: 94,
                          height: 29,
                          px: 1,
                          borderRadius: 1,
                          textTransform: "none",
                          fontSize: 11.5,
                          fontWeight: 600,
                          bgcolor: T.greenDark,
                          "&:hover": {
                            bgcolor: T.greenHover,
                          },
                          "&.Mui-disabled": {
                            bgcolor: "action.disabledBackground",
                            color: "text.disabled",
                          },
                          "& .MuiButton-endIcon": {
                            ml: 0.5,
                            mr: 0,
                          },
                        }}
                      >
                        Advance
                      </Button>
                    </span>
                  </Tooltip>

                  <Tooltip
                    title={
                      active
                        ? "Cancel work order"
                        : wo.currentStage === "cancelled"
                          ? "Already cancelled"
                          : "Completed - cannot cancel"
                    }
                  >
                    <span>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<CloseIcon />}
                        disabled={!active}
                        onClick={() => setCancelTarget(wo)}
                        sx={{
                          minWidth: 78,
                          height: 29,
                          px: 1,
                          borderRadius: 1,
                          textTransform: "none",
                          fontSize: 11.5,
                          fontWeight: 600,
                          "& .MuiButton-startIcon": {
                            ml: 0,
                            mr: 0.5,
                          },
                        }}
                      >
                        Cancel
                      </Button>
                    </span>
                  </Tooltip>

                  <Tooltip title="View full record">
                    <IconButton
                      size="small"
                      aria-label="View full record"
                      onClick={() => setViewWO(wo)}
                      sx={{
                        width: 29,
                        height: 29,
                        border: 1,
                        borderColor: "divider",
                        borderRadius: 1,
                        color: T.greenDark,
                        "&:hover": {
                          bgcolor: T.greenLight,
                          borderColor: T.green,
                        },
                      }}
                    >
                      <VisibilityOutlinedIcon sx={{ fontSize: 17 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </TableCell>
            </TableRow>
          );
        })}

        {pageRows.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={5}
              align="center"
              sx={{ py: 5, color: "text.secondary" }}
            >
              <Typography variant="body2" fontWeight={600}>
                {loading
                  ? "Loading work orders..."
                  : orders.length === 0
                    ? "No work orders yet"
                    : "No matching work orders found"}
              </Typography>

              {!loading && orders.length === 0 && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  sx={{ mt: 0.5 }}
                >
                  Create your first work order using New Work Order.
                </Typography>
              )}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  </TableContainer>

  {/* Compact pagination footer */}
  <Box
    sx={{
      px: 1.5,
      py: 1,
      minHeight: 48,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 1.5,
      flexWrap: "wrap",
      borderTop: 1,
      borderColor: T.rowBorder,
      bgcolor: "background.paper",
    }}
  >
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontSize: 11.5 }}
      >
        Rows per page
      </Typography>

      <TextField
        select
        size="small"
        value={rowsPerPage}
        onChange={(e) =>
          setRowsPerPage(parseInt(e.target.value, 10))
        }
        sx={{
          width: 66,
          "& .MuiOutlinedInput-root": {
            height: 29,
            borderRadius: 1,
            fontSize: 12,
          },
          "& .MuiSelect-select": {
            py: 0.5,
            px: 1,
          },
        }}
      >
        {[5, 10, 25, 50].map((n) => (
          <MenuItem key={n} value={n} sx={{ fontSize: 12 }}>
            {n}
          </MenuItem>
        ))}
      </TextField>
    </Box>

    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mr: 0.5, fontSize: 11.5 }}
      >
        {orders.length === 0
          ? "0 records"
          : `${page * rowsPerPage + 1}–${Math.min(
              (page + 1) * rowsPerPage,
              orders.length
            )} of ${orders.length}`}
      </Typography>

      <IconButton
        size="small"
        aria-label="Previous page"
        disabled={page === 0}
        onClick={() => setPage(page - 1)}
        sx={{
          width: 29,
          height: 29,
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
        }}
      >
        <ChevronLeftIcon sx={{ fontSize: 18 }} />
      </IconButton>

      {pageNumbers.map((n) => (
        <Button
          key={n}
          size="small"
          onClick={() => setPage(n)}
          variant={n === page ? "contained" : "text"}
          disableElevation
          sx={{
            minWidth: 29,
            width: 29,
            height: 29,
            p: 0,
            borderRadius: 1,
            fontSize: 12,
            fontWeight: 700,
            ...(n === page
              ? {
                  bgcolor: T.greenDark,
                  color: "#fff",
                  "&:hover": { bgcolor: T.greenHover },
                }
              : {
                  color: "text.secondary",
                  "&:hover": { bgcolor: T.greenLight },
                }),
          }}
        >
          {n + 1}
        </Button>
      ))}

      <IconButton
        size="small"
        aria-label="Next page"
        disabled={page >= totalPages - 1}
        onClick={() => setPage(page + 1)}
        sx={{
          width: 29,
          height: 29,
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
        }}
      >
        <ChevronRightIcon sx={{ fontSize: 18 }} />
      </IconButton>
    </Box>
  </Box>
</Paper>

      {/* ---------- Create dialog (New Work Order button se khulta hai) ---------- */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="md" scroll="paper">
        <DialogHeader title="New Work Order" onClose={() => setCreateOpen(false)} />
        <DialogContent dividers sx={{ bgcolor: "#fafcfa" }}>
          <Typography sx={{ ...sectionLabelSx, mb: 1.5 }}>Details</Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="WO Number" value={form.workOrderNumber}
                onChange={(e) => setForm({ ...form, workOrderNumber: e.target.value })} sx={{ bgcolor: "#fff" }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" type="date" label="Scheduled Date" InputLabelProps={{ shrink: true }}
                value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} sx={{ bgcolor: "#fff" }} />
            </Grid>
          </Grid>

          <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
            <Typography sx={sectionLabelSx}>Models / Items ({lines.length})</Typography>
            <Button size="small" color="success" startIcon={<AddIcon />} onClick={addLine}>Add model</Button>
          </Box>
          <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
            Length / Width / Thickness / Density optional hain - blank chhodo to unsized/raw item banega,
            bharo to specific manufacturing spec. Ek hi item alag-alag size me alag work orders me chal sakta hai.
          </Typography>

          {lines.map((line, idx) => (
            <Paper key={idx} variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: 2, borderColor: T.border }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography variant="body2" fontWeight={700} sx={{ color: T.greenDark }}>Model {idx + 1}</Typography>
                <Tooltip title={lines.length === 1 ? "Kam se kam ek model chahiye" : "Remove model"}>
                  <span>
                    <IconButton size="small" color="error" aria-label="remove model"
                      onClick={() => removeLine(idx)} disabled={lines.length === 1}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={4}>
                  <TextField select fullWidth size="small" label="Item" value={line.item}
                    onChange={(e) => updateLine(idx, { item: e.target.value })}>
                    {items.map((it) => <MenuItem key={it._id} value={it._id}>{it.name} ({it.unit})</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={6} sm={2}>
                  <TextField fullWidth size="small" type="number" label="Planned Qty" value={line.plannedQty}
                    onChange={(e) => updateLine(idx, { plannedQty: e.target.value })} />
                </Grid>
                <Grid item xs={6} sm={2}>
                  <TextField fullWidth size="small" type="number" label="Length" value={line.length}
                    onChange={(e) => updateLine(idx, { length: e.target.value })} />
                </Grid>
                <Grid item xs={6} sm={2}>
                  <TextField fullWidth size="small" type="number" label="Width" value={line.width}
                    onChange={(e) => updateLine(idx, { width: e.target.value })} />
                </Grid>
                <Grid item xs={6} sm={1}>
                  <TextField fullWidth size="small" type="number" label="Thick" value={line.thickness}
                    onChange={(e) => updateLine(idx, { thickness: e.target.value })} />
                </Grid>
                <Grid item xs={6} sm={1}>
                  <TextField fullWidth size="small" type="number" label="Density" value={line.density}
                    onChange={(e) => updateLine(idx, { density: e.target.value })} />
                </Grid>
              </Grid>
            </Paper>
          ))}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          {!canCreate && (
            <Typography variant="caption" color="text.secondary" sx={{ mr: "auto" }}>
              WO number aur har model ki item + planned qty zaroori hai
            </Typography>
          )}
          <Button color="inherit" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" disableElevation disabled={saving || !canCreate} onClick={handleCreate}>
            {saving ? "Creating..." : "Create Work Order"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---------- Final-stage dialog: collect actual produced/scrap qty per model ---------- */}
      <Dialog open={!!produceDialogWO} onClose={() => setProduceDialogWO(null)} fullWidth maxWidth="sm" scroll="paper">
        <DialogHeader title="Move to Ready to Dispatch" onClose={() => setProduceDialogWO(null)} />
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Har model ki actual produced aur scrap quantity daalo. Isse BOM ke hisaab se raw
            material consume hoga aur finished-goods stock me credit hoga.
          </Typography>
          {produceDialogWO?.items.map((l, idx) => (
            <Paper key={idx} variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: 2, borderColor: T.border }}>
              <Grid container spacing={1.5} alignItems="center">
                <Grid item xs={12} sm={5}>
                  <Typography variant="body2" fontWeight={700} noWrap>{l.item.name}</Typography>
                  {l.variant?.sizeLabel && <Typography variant="caption" display="block" color="text.secondary" noWrap>{l.variant.sizeLabel}</Typography>}
                  <Typography variant="caption" color="text.secondary">Planned: {l.plannedQty}</Typography>
                </Grid>
                <Grid item xs={6} sm={3.5}>
                  <TextField fullWidth size="small" type="number" label="Produced" value={produceValues[idx]?.producedQty || ""}
                    onChange={(e) => setProduceValues({ ...produceValues, [idx]: { ...produceValues[idx], producedQty: e.target.value } })} />
                </Grid>
                <Grid item xs={6} sm={3.5}>
                  <TextField fullWidth size="small" type="number" label="Scrap" value={produceValues[idx]?.scrapQty || ""}
                    onChange={(e) => setProduceValues({ ...produceValues, [idx]: { ...produceValues[idx], scrapQty: e.target.value } })} />
                </Grid>
              </Grid>
            </Paper>
          ))}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button color="inherit" onClick={() => setProduceDialogWO(null)}>Cancel</Button>
          <Button variant="contained" color="success" disableElevation disabled={saving} onClick={confirmFinalStage}>
            {saving ? "Saving..." : "Confirm & Update Stock"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---------- Full record view ---------- */}
      <Dialog open={!!viewWO} onClose={() => setViewWO(null)} fullWidth maxWidth="sm" scroll="paper">
        <DialogHeader title={`${viewWO?.workOrderNumber ?? ""} - Full Record`} onClose={() => setViewWO(null)} />
        <DialogContent dividers>
          {viewWO && (
            <>
              {/* summary */}
              <Box display="flex" gap={3} flexWrap="wrap" alignItems="center" mb={2.5}>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">Stage</Typography>
                  <StageChip stage={viewWO.currentStage} />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">Scheduled</Typography>
                  <Typography variant="body2" fontWeight={600}>{fmtDate(viewWO.scheduledDate)}</Typography>
                </Box>
                {viewWO.completedDate && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">Completed</Typography>
                    <Typography variant="body2" fontWeight={600}>{fmtDate(viewWO.completedDate)}</Typography>
                  </Box>
                )}
              </Box>

              {viewWO.currentStage !== "cancelled" && (
                <Stepper activeStep={STAGE_ORDER.indexOf(viewWO.currentStage)} alternativeLabel sx={{ mb: 3 }}>
                  {STAGE_ORDER.map((s) => (
                    <Step key={s}>
                      <StepLabel sx={{ "& .MuiStepLabel-label": { fontSize: 11 } }}>{STAGE_LABELS[s]}</StepLabel>
                    </Step>
                  ))}
                </Stepper>
              )}

              <Typography sx={{ ...sectionLabelSx, mb: 1 }}>Models</Typography>
              <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 1, mb: 3 }}>
                <Table size="small" sx={{ "& .MuiTableCell-head": { bgcolor: "#f4f7f4", fontWeight: 700 } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Item</TableCell><TableCell>Size/Spec</TableCell>
                      <TableCell align="right">Planned</TableCell><TableCell align="right">Produced</TableCell><TableCell align="right">Scrap</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {viewWO.items.map((l, i) => (
                      <TableRow key={i}>
                        <TableCell>{l.item?.name}</TableCell>
                        <TableCell>{l.variant?.sizeLabel || "-"}</TableCell>
                        <TableCell align="right">{l.plannedQty}</TableCell>
                        <TableCell align="right">{l.producedQty}</TableCell>
                        <TableCell align="right">{l.scrapQty}</TableCell>
                      </TableRow>
                    ))}
                    {viewWO.items.length === 0 && (
                      <TableRow><TableCell colSpan={5} align="center" sx={{ color: "text.secondary" }}>
                        {viewWO.item ? `Legacy record (qty ${viewWO.plannedQty ?? "-"})` : "No models"}
                      </TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <Typography sx={{ ...sectionLabelSx, mb: 1 }}>Stage History</Typography>
              {viewWO.stageHistory.map((h, i) => (
                <Box key={i} py={0.75}>
                  <Typography variant="body2">
                    <b>{STAGE_LABELS[h.stage]}</b> — {new Date(h.changedAt).toLocaleString("en-IN")} {h.changedBy ? `by ${h.changedBy.name}` : ""}
                  </Typography>
                  {h.remarks && <Typography variant="caption" color="text.secondary">{h.remarks}</Typography>}
                  {i < viewWO.stageHistory.length - 1 && <Divider sx={{ mt: 0.75 }} />}
                </Box>
              ))}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button color="success" onClick={() => setViewWO(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancel Work Order?"
        message={`This will cancel "${cancelTarget?.workOrderNumber}". No stock has moved yet so this is safe.`}
        confirmLabel="Cancel Work Order"
        onConfirm={handleCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </Box>
  );
}