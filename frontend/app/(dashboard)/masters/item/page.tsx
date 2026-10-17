"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Table, TableHead, TableRow, TableCell, TableBody,
  Paper, TableContainer, Box, Chip, IconButton, Tooltip, FormControlLabel,
  Switch, Grid, Tabs, Tab, TablePagination, InputAdornment, CircularProgress,
} from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SearchIcon from "@mui/icons-material/Search";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import api from "@/lib/api";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useSnackbar } from "@/components/SnackbarProvider";

interface Hsn { _id: string; code: string; sgst: number; cgst: number; igst: number; }
interface Item {
  _id: string; productCode?: string; name: string; type?: string; unit: string; hsn: Hsn;
  category: string; size?: string; thickness?: string; density?: string;
  stockQty: number; reorderLevel: number; purchaseRate?: number; mrp?: number;
  rateA?: number; rateB?: number; barcode?: string; warrantyMonths?: number; isActive: boolean;
}
interface ItemsPage { items: Item[]; pagination: { page: number; limit: number; total: number; totalPages: number }; }
interface ItemVariant {
  _id: string; length?: number; width?: number; thickness?: number; density?: number; unit?: string;
  sizeLabel: string; isUnspecified: boolean; availableQty: number; totalReceived: number; totalIssued: number;
}

// ---------- Theme tokens (Production page jaisi hi green theme) ----------
const T = {
  green: "#2e7d32",
  greenDark: "#1b5e20",
  greenHover: "#14451a",
  greenLight: "#e8f5e9",
  ink: "#14281b",
  border: "#e3ebe4",
  rowBorder: "#edf1ed",
  red: "#d32f2f",
  redLight: "#ffebee",
  shadow: "0 1px 3px rgba(20,40,27,0.06)",
};

const cardSx = { borderRadius: 3, borderColor: T.border, boxShadow: T.shadow, bgcolor: "#fff", overflow: "hidden" } as const;

// Green header row for every table (list + size-wise stock dialog)
const tableSx = {
  "& .MuiTableCell-root": { py: 0.5, px: 1.5, borderColor: T.rowBorder },
  "& .MuiTableCell-head": {
    bgcolor: T.greenDark, color: "#fff", fontWeight: 700, fontSize: 12,
    textTransform: "uppercase", letterSpacing: 0.6, whiteSpace: "nowrap", py: 1,
  },
  "& .MuiTableCell-body": { verticalAlign: "middle", fontSize: 13.5 },
} as const;

const pillSx = { height: 22, fontSize: 12, fontWeight: 600 } as const;
const iconBtnSx = { width: 28, height: 28 } as const;

const emptyForm = {
  name: "", type: "", unit: "PCS", hsn: "", category: "mattress", size: "", thickness: "", density: "",
  reorderLevel: 0, fastSearch: false, decimalAllowed: false, isCompanyProduct: true,
  purchaseRate: "", mrp: "", rateA: "", rateB: "", barcode: "", warrantyMonths: "", isActive: true,
};

// Shared dialog header: green bar (+ optional subtitle) + close button
function DialogHeader({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  return (
    <DialogTitle sx={{ bgcolor: T.green, color: "#fff", py: 1.25, pr: 6 }}>
      <Typography fontSize={17} fontWeight={700} lineHeight={1.3}>{title}</Typography>
      {subtitle && <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.85)" }} display="block">{subtitle}</Typography>}
      <IconButton size="small" aria-label="close" onClick={onClose} sx={{ color: "#fff", position: "absolute", right: 12, top: 10 }}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </DialogTitle>
  );
}

export default function ItemMasterPage() {
  const { showMessage } = useSnackbar();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState(0);

  // Size/specification-wise stock - "View" opens this for a given item (see models/
  // ItemVariant.js). Size/thickness/density now live at the Work Order/Purchase level, not
  // on the general Item itself, so this is the only place to see available stock per size.
  const [viewTarget, setViewTarget] = useState<Item | null>(null);
  const [variants, setVariants] = useState<ItemVariant[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantsError, setVariantsError] = useState(false);

  const openView = async (it: Item) => {
    setViewTarget(it);
    setVariants([]);
    setVariantsError(false);
    setVariantsLoading(true);
    try {
      const res = await api.get(`/masters/items/${it._id}/variants`);
      setVariants(res.data);
    } catch {
      setVariantsError(true);
    } finally {
      setVariantsLoading(false);
    }
  };

  // Search is debounced (300ms) so typing doesn't fire a backend request per keystroke -
  // search/filtering happens server-side, never by downloading everything into the browser.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [page, setPage] = useState(0); // MUI TablePagination is 0-indexed
  const [rowsPerPage, setRowsPerPage] = useState(25);
  useEffect(() => { setPage(0); }, [search]); // a new search always starts from page 1

  const itemsKey = `/masters/items?page=${page + 1}&limit=${rowsPerPage}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
  // keepPreviousData (set globally in the dashboard layout's SWRConfig) means switching page/
  // search shows the previous results until the new ones arrive, instead of flashing empty -
  // and revisiting this screen after navigating away shows the last-known page INSTANTLY
  // (served straight from SWR's cache) while it quietly revalidates in the background.
  const { data: itemsRes, isLoading, mutate: refetchItems } = useSWR<ItemsPage>(itemsKey);
  const { data: hsnList = [] } = useSWR<Hsn[]>("/masters/hsn");

  const items = itemsRes?.items || [];
  const total = itemsRes?.pagination.total || 0;

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setTab(0); setOpen(true); };
  const openEdit = (it: Item) => {
    setEditingId(it._id);
    setForm({
      ...emptyForm, name: it.name, type: it.type || "", unit: it.unit, hsn: it.hsn?._id || "",
      category: it.category, size: it.size || "", thickness: it.thickness || "", density: it.density || "",
      reorderLevel: it.reorderLevel, purchaseRate: String(it.purchaseRate || ""), mrp: String(it.mrp || ""),
      rateA: String(it.rateA || ""), rateB: String(it.rateB || ""), barcode: it.barcode || "",
      warrantyMonths: String(it.warrantyMonths || ""), isActive: it.isActive,
    });
    setTab(0);
    setOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        purchaseRate: Number(form.purchaseRate || 0), mrp: Number(form.mrp || 0),
        rateA: Number(form.rateA || 0), rateB: Number(form.rateB || 0),
        warrantyMonths: Number(form.warrantyMonths || 0),
      };
      if (editingId) {
        await api.put(`/masters/items/${editingId}`, payload);
        showMessage("Product updated", "success");
      } else {
        await api.post("/masters/items", payload);
        showMessage("Product created", "success");
      }
      setOpen(false);
      await refetchItems();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/masters/items/${deleteTarget._id}`);
      showMessage("Product deleted", "success");
      setDeleteTarget(null);
      await refetchItems();
    } finally {
      setDeleting(false);
    }
  };

  const selectedHsn = hsnList.find((h) => h._id === form.hsn);

  return (
    <>
      {/* ---------- Page header ---------- */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5} gap={2} flexWrap="wrap">
        <Typography variant="h6" fontWeight={800} sx={{ color: T.ink }}>Product / Item Master</Typography>
        <Box display="flex" gap={1.5} flexWrap="wrap">
          <TextField
            size="small" placeholder="Search by name, code, or barcode..." value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            sx={{ minWidth: { xs: "100%", sm: 300 }, "& .MuiOutlinedInput-root": { height: 36, borderRadius: 1.5, bgcolor: "#fff", fontSize: 14 } }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
              endAdornment: isLoading ? <InputAdornment position="end"><CircularProgress size={14} color="success" /></InputAdornment> : undefined,
            }}
          />
          <Button variant="contained" disableElevation startIcon={<AddIcon />} onClick={openCreate}
            sx={{ bgcolor: T.greenDark, "&:hover": { bgcolor: T.greenHover }, fontWeight: 700, px: 2, height: 36, borderRadius: 1.5 }}>
            New Product
          </Button>
        </Box>
      </Box>

      {/* ---------- Table ---------- */}
      <Paper variant="outlined" sx={cardSx}>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ ...tableSx, minWidth: 820 }}>
            <TableHead>
              <TableRow>
                <TableCell>Code</TableCell><TableCell>Name</TableCell><TableCell>Category</TableCell>
                <TableCell>HSN</TableCell><TableCell align="right">MRP</TableCell>
                <TableCell align="right">Stock</TableCell><TableCell>Status</TableCell><TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it._id} hover sx={{ height: 42 }}>
                  <TableCell><Typography variant="caption" color="text.secondary" noWrap>{it.productCode}</Typography></TableCell>
                  <TableCell><Typography variant="body2" fontWeight={600} noWrap>{it.name}</Typography></TableCell>
                  <TableCell><Chip size="small" label={it.category} sx={{ ...pillSx, bgcolor: "#eceff1", color: "#546e7a" }} /></TableCell>
                  <TableCell>{it.hsn?.code}</TableCell>
                  <TableCell align="right">{it.mrp ? `₹${it.mrp.toLocaleString("en-IN")}` : "-"}</TableCell>
                  <TableCell align="right">{it.stockQty}</TableCell>
                  <TableCell>
                    {it.stockQty <= it.reorderLevel
                      ? <Chip size="small" label="Low Stock" sx={{ ...pillSx, bgcolor: T.redLight, color: T.red }} />
                      : <Chip size="small" label="OK" sx={{ ...pillSx, bgcolor: T.greenLight, color: T.green }} />}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    <Tooltip title="View size-wise stock"><IconButton size="small" sx={{ ...iconBtnSx, color: T.green }} onClick={() => openView(it)}><VisibilityOutlinedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                    <Tooltip title="Edit"><IconButton size="small" sx={iconBtnSx} onClick={() => openEdit(it)}><EditOutlinedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" sx={{ ...iconBtnSx, color: T.red }} onClick={() => setDeleteTarget(it)}><DeleteOutlineIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4, color: "text.secondary" }}>{isLoading ? "Loading..." : "No products found"}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div" count={total} page={page} onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage} onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50, 100]}
          sx={{
            borderTop: 1, borderColor: T.rowBorder,
            "& .MuiTablePagination-toolbar": { minHeight: 44 },
            "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": { fontSize: 13, m: 0 },
          }}
        />
      </Paper>

      {/* ---------- Create / Edit dialog ---------- */}
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogHeader
          title={editingId ? "Edit Product" : "New Product"}
          subtitle={editingId ? `Code: ${items.find((i) => i._id === editingId)?.productCode}` : "Product Code will be auto-generated"}
          onClose={() => setOpen(false)}
        />
        <Tabs value={tab} onChange={(_, v) => setTab(v)} textColor="inherit"
          TabIndicatorProps={{ style: { backgroundColor: T.green } }}
          sx={{ px: 2, minHeight: 40, borderBottom: 1, borderColor: "divider", "& .MuiTab-root": { minHeight: 40, py: 0 }, "& .Mui-selected": { color: T.greenDark, fontWeight: 700 } }}>
          <Tab label="Basic Details" /><Tab label="Pricing & Stock" /><Tab label="Other" />
        </Tabs>
        <DialogContent sx={{ pt: 2.5, pb: 1.5 }}>
          {tab === 0 && (
            <Grid container spacing={1.5}>
              <Grid item xs={12}><TextField fullWidth size="small" label="Product Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="Unit *" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Grid>
              <Grid item xs={12} sm={6}><TextField select fullWidth size="small" label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <MenuItem value="mattress">Mattress</MenuItem><MenuItem value="foam_sheet">Foam Sheet</MenuItem>
                <MenuItem value="pillow">Pillow</MenuItem><MenuItem value="cushion">Cushion</MenuItem>
                <MenuItem value="raw_material">Raw Material</MenuItem><MenuItem value="other">Other</MenuItem>
              </TextField></Grid>
              <Grid item xs={12} sm={6}><TextField select fullWidth size="small" label="HSN / SAC *" value={form.hsn} onChange={(e) => setForm({ ...form, hsn: e.target.value })}>
                {hsnList.map((h) => <MenuItem key={h._id} value={h._id}>{h.code} (GST {h.igst}%)</MenuItem>)}
              </TextField></Grid>
              {(form.size || form.thickness || form.density) ? (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Legacy size/thickness/density on this item (read-only - new sizes are now
                    entered per Work Order or Purchase, not here): {[form.size, form.thickness, form.density].filter(Boolean).join(" · ")}
                  </Typography>
                </Grid>
              ) : (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Size/thickness/density are no longer set here - specify them when creating
                    a Work Order or a Purchase, so the same general product can carry stock in
                    multiple sizes.
                  </Typography>
                </Grid>
              )}
              <Grid item xs={12} sm={4}><FormControlLabel control={<Switch size="small" color="success" checked={form.fastSearch} onChange={(e) => setForm({ ...form, fastSearch: e.target.checked })} />} label="Fast Search" /></Grid>
              <Grid item xs={12} sm={4}><FormControlLabel control={<Switch size="small" color="success" checked={form.decimalAllowed} onChange={(e) => setForm({ ...form, decimalAllowed: e.target.checked })} />} label="Decimal Qty" /></Grid>
              <Grid item xs={12} sm={4}><FormControlLabel control={<Switch size="small" color="success" checked={form.isCompanyProduct} onChange={(e) => setForm({ ...form, isCompanyProduct: e.target.checked })} />} label="Company Product" /></Grid>
            </Grid>
          )}

          {tab === 1 && (
            <Grid container spacing={1.5}>
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary">
                  GST (from HSN {selectedHsn?.code || "-"}): SGST {selectedHsn?.sgst ?? "-"}% · CGST {selectedHsn?.cgst ?? "-"}% · IGST {selectedHsn?.igst ?? "-"}%
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth size="small" type="number" label="P. Rate (Purchase Rate)" value={form.purchaseRate} onChange={(e) => setForm({ ...form, purchaseRate: e.target.value })} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth size="small" type="number" label="M.R.P." value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth size="small" type="number" label="Rate A (e.g. wholesale)" value={form.rateA} onChange={(e) => setForm({ ...form, rateA: e.target.value })} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth size="small" type="number" label="Rate B (e.g. retail)" value={form.rateB} onChange={(e) => setForm({ ...form, rateB: e.target.value })} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth size="small" type="number" label="Reorder Level (Low Stock Alert)" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })} /></Grid>
            </Grid>
          )}

          {tab === 2 && (
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="Barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth size="small" type="number" label="Warranty (Months)" value={form.warrantyMonths} onChange={(e) => setForm({ ...form, warrantyMonths: e.target.value })} /></Grid>
              <Grid item xs={12}><FormControlLabel control={<Switch size="small" color="success" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />} label={form.isActive ? "Active" : "Inactive"} /></Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1 }}>
          <Button size="small" color="inherit" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="small" variant="contained" color="success" disableElevation disabled={saving || !form.name || !form.hsn} onClick={handleSave}>
            {saving ? "Saving..." : editingId ? "Update" : "Save Product"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Product?"
        message={`This will permanently delete "${deleteTarget?.name}". This cannot be undone.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* ---------- Size-wise stock dialog ---------- */}
      <Dialog open={!!viewTarget} onClose={() => setViewTarget(null)} fullWidth maxWidth="md">
        <DialogHeader
          title={`${viewTarget?.name ?? ""} - Size-wise Stock`}
          subtitle="Every specification this product has ever been received or sold in, each with its own stock."
          onClose={() => setViewTarget(null)}
        />
        <DialogContent sx={{ pt: 2 }}>
          <Paper variant="outlined" sx={{ ...cardSx, mt: 1 }}>
            <TableContainer>
              <Table size="small" sx={tableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell>Size (L x W)</TableCell>
                    <TableCell>Thickness</TableCell>
                    <TableCell>Density</TableCell>
                    <TableCell align="right">Total Received</TableCell>
                    <TableCell align="right">Total Issued</TableCell>
                    <TableCell align="right">Available Qty</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {variants.map((v) => (
                    <TableRow key={v._id} hover>
                      <TableCell>{v.isUnspecified ? <i>Unspecified</i> : (v.length && v.width ? `${v.length} x ${v.width} ${v.unit || ""}` : "-")}</TableCell>
                      <TableCell>{v.thickness ? `${v.thickness} ${v.unit || ""}` : "-"}</TableCell>
                      <TableCell>{v.density ?? "-"}</TableCell>
                      <TableCell align="right">{v.totalReceived}</TableCell>
                      <TableCell align="right">{v.totalIssued}</TableCell>
                      <TableCell align="right"><b>{v.availableQty}</b></TableCell>
                      <TableCell>
                        {v.availableQty <= 0
                          ? <Chip size="small" label="Out of Stock" sx={{ ...pillSx, bgcolor: T.redLight, color: T.red }} />
                          : <Chip size="small" label="In Stock" sx={{ ...pillSx, bgcolor: T.greenLight, color: T.green }} />}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!variantsLoading && !variantsError && variants.length === 0 && (
                    <TableRow><TableCell colSpan={7} align="center" sx={{ py: 3, color: "text.secondary" }}>No sized stock recorded yet for this product - it will appear here after a Purchase or Work Order specifies a size.</TableCell></TableRow>
                  )}
                  {variantsLoading && (
                    <TableRow><TableCell colSpan={7} align="center" sx={{ py: 3 }}>Loading...</TableCell></TableRow>
                  )}
                  {variantsError && (
                    <TableRow><TableCell colSpan={7} align="center" sx={{ py: 3, color: "error.main" }}>Could not load stock details - please try again.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1 }}><Button size="small" color="success" onClick={() => setViewTarget(null)}>Close</Button></DialogActions>
      </Dialog>
    </>
  );
}