"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Typography, Box, Grid, TextField, MenuItem, Button, Table, TableHead,
  TableRow, TableCell, TableBody, Paper, TableContainer, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TablePagination, InputAdornment,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import api from "@/lib/api";
import { useSnackbar } from "@/components/SnackbarProvider";

interface Item { _id: string; name: string; unit: string; stockQty: number; reorderLevel: number; }
interface StockTxn {
  _id: string; type: string; item: { name: string; unit: string }; quantity: number;
  direction?: "increase" | "decrease"; remarks?: string; createdAt: string;
}

// ---------- Theme tokens (Production / Item Master / Sales / Purchase jaisi hi green theme) ----------
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

// Green header row for the table
const tableSx = {
  "& .MuiTableCell-root": { py: 0.5, px: 1.5, borderColor: T.rowBorder },
  "& .MuiTableCell-head": {
    bgcolor: T.greenDark, color: "#fff", fontWeight: 700, fontSize: 12,
    textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap", py: 1,
  },
  "& .MuiTableCell-body": { fontVariantNumeric: "tabular-nums", verticalAlign: "middle", fontSize: 13.5 },
} as const;

const pillSx = { height: 22, fontSize: 12, fontWeight: 600 } as const;

const TYPE_LABEL: Record<string, string> = {
  receive: "Receive", scrap_issue: "Scrap Issue", scrap_return: "Scrap Return",
  stock_adjustment: "Stock Adjustment", bom_consumption: "Production Consumption",
  production_output: "Production Output", sale_out: "Sale", purchase_in: "Purchase",
  sales_return: "Sales Return", purchase_return: "Purchase Return",
};
const TYPE_STYLE: Record<string, { bg: string; fg: string }> = {
  receive: { bg: T.greenLight, fg: T.green }, scrap_return: { bg: T.greenLight, fg: T.green },
  production_output: { bg: T.greenLight, fg: T.green }, purchase_in: { bg: T.greenLight, fg: T.green },
  scrap_issue: { bg: T.redLight, fg: T.red }, bom_consumption: { bg: T.redLight, fg: T.red },
  sale_out: { bg: T.redLight, fg: T.red }, purchase_return: { bg: T.redLight, fg: T.red },
  stock_adjustment: { bg: T.blueLight, fg: T.blue }, sales_return: { bg: T.blueLight, fg: T.blue },
};

// Which way a transaction moves stock - used only to colour/sign the Quantity column.
const INCREASE_TYPES = ["receive", "scrap_return", "production_output", "purchase_in", "sales_return"];
const DECREASE_TYPES = ["scrap_issue", "bom_consumption", "sale_out", "purchase_return"];
const moveOf = (t: StockTxn): "increase" | "decrease" | null => {
  if (t.type === "stock_adjustment") return t.direction ?? null;
  if (INCREASE_TYPES.includes(t.type)) return "increase";
  if (DECREASE_TYPES.includes(t.type)) return "decrease";
  return null;
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

const emptyForm = { type: "receive", item: "", quantity: "", direction: "increase", remarks: "" };

export default function StockPage() {
  const { showMessage } = useSnackbar();
  const [items, setItems] = useState<Item[]>([]);
  const [txns, setTxns] = useState<StockTxn[]>([]);
  const [txnsTotal, setTxnsTotal] = useState(0);
  const [txnsPage, setTxnsPage] = useState(0); // MUI TablePagination is 0-indexed
  const [txnsRowsPerPage, setTxnsRowsPerPage] = useState(10);
  const [txnsSearchInput, setTxnsSearchInput] = useState("");
  const [txnsSearch, setTxnsSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTxnsSearch(txnsSearchInput), 300);
    return () => clearTimeout(t);
  }, [txnsSearchInput]);
  useEffect(() => { setTxnsPage(0); }, [txnsSearch]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const loadData = async () => {
    // allSettled, not all - these two are independent, and Promise.all would let ONE
    // failing/slow request wipe out data that DID load successfully (same bug already fixed
    // in Sales/Purchase/Production/Dispatch - see the matching note in sales/page.tsx's loadData).
    const [itemRes, txnRes] = await Promise.allSettled([
      api.get("/masters/items"),
      api.get("/production/stock", { params: {
        page: txnsPage + 1, limit: txnsRowsPerPage,
        search: txnsSearch || undefined,
      } }),
    ]);
    if (itemRes.status === "fulfilled") setItems(itemRes.value.data);
    if (txnRes.status === "fulfilled") {
      setTxns(txnRes.value.data.transactions);
      setTxnsTotal(txnRes.value.data.pagination.total);
    }
  };

  useEffect(() => { loadData(); }, [txnsPage, txnsRowsPerPage, txnsSearch]);

  const selectedItem = items.find((i) => i._id === form.item);
  const isAdjustment = form.type === "stock_adjustment";

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post("/production/stock", {
        type: form.type,
        item: form.item,
        quantity: Number(form.quantity),
        direction: isAdjustment ? form.direction : undefined,
        remarks: form.remarks || undefined,
      });
      showMessage("Stock transaction recorded", "success");
      setForm(emptyForm);
      setCreateOpen(false);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const canSave = form.item && Number(form.quantity) > 0 && (!isAdjustment || form.remarks.trim());

  return (
    <>
      {/* ---------- Page header ---------- */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5} gap={2} flexWrap="wrap">
        <Box display="flex" alignItems="center" gap={1.25}>
          <Inventory2OutlinedIcon sx={{ fontSize: 34, color: T.greenDark }} />
          <Box>
            <Typography variant="h6" fontWeight={700} lineHeight={1.2} sx={{ color: T.ink }}>Stock Transactions</Typography>
            <Typography variant="caption" color="text.secondary">
              Manual stock movements. Sales, Purchase and Production post automatically from their own screens.
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" disableElevation startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}
          sx={{ bgcolor: T.greenDark, "&:hover": { bgcolor: T.greenHover }, fontWeight: 700, px: 2.5, height: 36, borderRadius: 1.5 }}>
          New Stock Entry
        </Button>
      </Box>

      {/* ---------- Stock ledger table ---------- */}
      <Paper variant="outlined" sx={cardSx}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: T.rowBorder, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
          <Typography fontWeight={700} sx={{ color: T.ink }}>Stock Ledger</Typography>
          <Box display="flex" alignItems="center" gap={1.5}>
            <TextField
              size="small" placeholder="Search item or remarks..." value={txnsSearchInput}
              onChange={(e) => setTxnsSearchInput(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
              sx={{ width: 220, "& .MuiOutlinedInput-root": { height: 32, fontSize: 13 } }}
            />
            <Typography variant="body2" color="text.secondary">{txnsTotal} transaction{txnsTotal === 1 ? "" : "s"}</Typography>
          </Box>
        </Box>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ ...tableSx, minWidth: 760 }}>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Item</TableCell>
                <TableCell align="right">Quantity</TableCell>
                <TableCell>Remarks</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {txns.map((t) => {
                const st = TYPE_STYLE[t.type] ?? { bg: T.greyLight, fg: T.grey };
                const move = moveOf(t);
                return (
                  <TableRow key={t._id} hover sx={{ height: 42 }}>
                    <TableCell sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>{new Date(t.createdAt).toLocaleString("en-IN")}</TableCell>
                    <TableCell><Chip size="small" label={TYPE_LABEL[t.type] || t.type} sx={{ ...pillSx, bgcolor: st.bg, color: st.fg }} /></TableCell>
                    <TableCell><Typography variant="body2" fontWeight={600} noWrap>{t.item?.name} {t.item?.unit ? `(${t.item.unit})` : ""}</Typography></TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={700} sx={{ color: move === "increase" ? T.green : move === "decrease" ? T.red : T.ink }}>
                        {move === "increase" ? "+" : move === "decrease" ? "−" : ""}{t.quantity}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ color: t.remarks ? "text.primary" : "text.secondary" }}>{t.remarks || "-"}</TableCell>
                  </TableRow>
                );
              })}
              {txns.length === 0 && (
                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: "text.secondary" }}>No stock transactions yet - 'New Stock Entry' se pehli banao</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div" count={txnsTotal} page={txnsPage} onPageChange={(_, p) => setTxnsPage(p)}
          rowsPerPage={txnsRowsPerPage} onRowsPerPageChange={(e) => { setTxnsRowsPerPage(Number(e.target.value)); setTxnsPage(0); }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </Paper>

      {/* ---------- New Stock Entry dialog ---------- */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth scroll="paper">
        <DialogHeader title="New Stock Entry" subtitle="Physical receipt, scrap, or a correction against a physical count." onClose={() => setCreateOpen(false)} />
        <DialogContent dividers sx={{ bgcolor: "#f6faf6", px: 2, py: 2 }}>
          <Paper variant="outlined" sx={{ ...cardSx, p: 2, overflow: "visible" }}>
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={isAdjustment ? 6 : 12}>
                <TextField select fullWidth size="small" label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <MenuItem value="receive">Receive</MenuItem>
                  <MenuItem value="scrap_issue">Scrap Issue</MenuItem>
                  <MenuItem value="scrap_return">Scrap Return</MenuItem>
                  <MenuItem value="stock_adjustment">Stock Adjustment</MenuItem>
                </TextField>
              </Grid>
              {isAdjustment && (
                <Grid item xs={12} sm={6}>
                  <TextField select fullWidth size="small" label="Direction" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                    <MenuItem value="increase">Increase</MenuItem>
                    <MenuItem value="decrease">Decrease</MenuItem>
                  </TextField>
                </Grid>
              )}
              <Grid item xs={12} sm={8}>
                <TextField select fullWidth size="small" label="Item" value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })}>
                  {items.map((it) => <MenuItem key={it._id} value={it._id}>{it.name} ({it.unit})</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth size="small" type="number" label="Quantity" value={form.quantity}
                  inputProps={{ min: 0 }} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </Grid>

              {selectedItem && (
                <Grid item xs={12}>
                  <Box display="flex" gap={1} alignItems="center" flexWrap="wrap">
                    <Chip size="small" label={`Current stock: ${selectedItem.stockQty} ${selectedItem.unit}`} sx={{ ...pillSx, bgcolor: T.greyLight, color: T.grey }} />
                    {selectedItem.stockQty <= selectedItem.reorderLevel && selectedItem.reorderLevel > 0 && (
                      <Chip size="small" label="Low Stock" sx={{ ...pillSx, bgcolor: T.amberLight, color: T.amber }} />
                    )}
                  </Box>
                </Grid>
              )}

              <Grid item xs={12}>
                <TextField fullWidth size="small" multiline minRows={2}
                  label={isAdjustment ? "Reason (required)" : "Remarks"} value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
              </Grid>
            </Grid>
          </Paper>

          <Typography variant="caption" color="text.secondary" display="block" mt={1.5}>
            Sales, Purchase, and Production movements are posted automatically by their own screens -
            use this only for a physical receipt, scrap, or a correction against a physical count.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.25 }}>
          <Button size="small" color="inherit" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" disableElevation disabled={saving || !canSave} onClick={handleSave} sx={{ px: 3 }}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}