"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Typography, Box, Grid, TextField, MenuItem, Button, Table, TableHead,
  TableRow, TableCell, TableBody, Paper, TableContainer, Chip, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, TablePagination, InputAdornment,
  Checkbox, FormControlLabel,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import api from "@/lib/api";

interface RemainingLine {
  // lineKey identifies EXACTLY this bill line (see backend utils/dispatchQuantities) - use it
  // as the React/state key instead of `item`, since a bill can have two lines of the same
  // item in different sizes; keying by `item` alone was the root cause of the bug where
  // dispatching one size silently merged with/consumed another size's remaining quantity.
  lineKey: string; item: string; variant?: string; name: string; unit: string; sizeLabel?: string;
  billedQty: number; dispatchedQty: number; remainingQty: number;
}
interface DispatchableBill {
  _id: string; billNumber: string; party: { _id: string; name: string };
  items: RemainingLine[];
}
// Full dealer/party record, as returned by /masters/ledgers - used only to preview Bill To /
// default Ship To details while creating a dispatch (the backend computes the real snapshot
// itself, see dispatchController.buildShipTo - this is display-only convenience).
interface PartyLedger {
  _id: string; name: string; dealerCode?: string; address?: string;
  city?: string; state?: string; pincode?: string; gstin?: string; mobile?: string;
}
// Editable Ship To / Transport form shape, shared by the New Dispatch dialog and the Edit
// Details dialog. Every field is optional - left blank rather than fabricated when unknown.
interface ShipToForm { name: string; dealerCode: string; address: string; city: string; state: string; pincode: string; gstin: string; mobile: string; }
interface TransportForm { transporterName: string; lrNumber: string; lrDate: string; vehicleNumber: string; ewayBillNumber: string; driverName: string; driverPhone: string; }
interface ShipTo extends Partial<ShipToForm> { sameAsBillTo: boolean; }
interface Transport extends Partial<TransportForm> {}
interface DispatchRow {
  _id: string; dispatchNumber: string; party: { _id: string; name: string };
  salesBill: { billNumber: string };
  dispatchType: string; status: string; dispatchDate: string;
  packingList: { item: { name: string; unit: string }; variant?: { sizeLabel: string }; quantity: number }[];
  shipTo?: ShipTo; transport?: Transport;
}

const emptyShipToForm: ShipToForm = { name: "", dealerCode: "", address: "", city: "", state: "", pincode: "", gstin: "", mobile: "" };
const emptyTransportForm: TransportForm = { transporterName: "", lrNumber: "", lrDate: "", vehicleNumber: "", ewayBillNumber: "", driverName: "", driverPhone: "" };

// ---------- Theme tokens (Production / Sales / Purchase / Stock jaisi hi green theme) ----------
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

const sectionLabelSx = { color: T.greenDark, fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 } as const;
const pillSx = { height: 22, fontSize: 12, fontWeight: 600 } as const;

const statusStyle: Record<string, { bg: string; fg: string }> = {
  pending: { bg: T.amberLight, fg: T.amber },
  in_transit: { bg: T.blueLight, fg: T.blue },
  delivered: { bg: T.greenLight, fg: T.green },
  returned: { bg: T.redLight, fg: T.red },
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

// Shared by the New Dispatch and Edit Details dialogs - "Same as Bill To" (default) shows a
// read-only preview of the dealer's own details; unchecking it reveals editable fields for a
// shipping address specific to this dispatch. `billToPreview` is display-only (the backend
// computes the real snapshot itself) - it can be undefined before a bill/party is selected.
function ShipToFields({
  same, setSame, form, setForm, billToPreview,
}: {
  same: boolean; setSame: (v: boolean) => void;
  form: ShipToForm; setForm: (f: ShipToForm) => void;
  billToPreview?: PartyLedger;
}) {
  return (
    <Paper variant="outlined" sx={{ ...cardSx, p: 2, mb: 2, overflow: "visible" }}>
      <FormControlLabel
        control={<Checkbox size="small" checked={same} onChange={(e) => setSame(e.target.checked)} />}
        label={<Typography sx={sectionLabelSx}>Ship To - Same as Bill To</Typography>}
      />
      {same ? (
        billToPreview ? (
          <Typography variant="body2" color="text.secondary" sx={{ pl: 4 }}>
            {billToPreview.name}{billToPreview.dealerCode ? ` (${billToPreview.dealerCode})` : ""}
            {billToPreview.address ? ` · ${billToPreview.address}` : ""}
            {billToPreview.city || billToPreview.state || billToPreview.pincode
              ? ` · ${[billToPreview.city, billToPreview.state, billToPreview.pincode].filter(Boolean).join(", ")}` : ""}
            {billToPreview.gstin ? ` · GSTIN: ${billToPreview.gstin}` : ""}
            {billToPreview.mobile ? ` · Mobile: ${billToPreview.mobile}` : ""}
          </Typography>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ pl: 4 }}>Select a Sales Bill above first.</Typography>
        )
      ) : (
        <Grid container spacing={1.5} mt={0.5}>
          <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="Receiver Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="Dealer Code (optional)" value={form.dealerCode} onChange={(e) => setForm({ ...form, dealerCode: e.target.value })} /></Grid>
          <Grid item xs={12}><TextField fullWidth size="small" label="Shipping Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Grid>
          <Grid item xs={12} sm={4}><TextField fullWidth size="small" label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Grid>
          <Grid item xs={12} sm={4}><TextField fullWidth size="small" label="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></Grid>
          <Grid item xs={12} sm={4}><TextField fullWidth size="small" label="Pincode" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="GSTIN (optional)" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="Mobile (optional)" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Grid>
        </Grid>
      )}
    </Paper>
  );
}

// Shared by the New Dispatch and Edit Details dialogs - every field is optional and left
// blank when unknown (never fabricated); vehicle number and driver phone are format-checked
// on the backend (see validators/dispatchValidators.js), so a bad value surfaces as an error
// on save rather than being silently accepted.
function TransportFields({ form, setForm }: { form: TransportForm; setForm: (f: TransportForm) => void }) {
  return (
    <Paper variant="outlined" sx={{ ...cardSx, p: 2, mb: 2, overflow: "visible" }}>
      <Typography sx={sectionLabelSx} mb={1.25}>Transport Details</Typography>
      <Grid container spacing={1.5}>
        <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="Transporter Name (e.g. BY SELF)" value={form.transporterName} onChange={(e) => setForm({ ...form, transporterName: e.target.value })} /></Grid>
        <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="Vehicle Number (e.g. UP81BT3635)" value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })} /></Grid>
        <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="LR No. / Lorry Receipt No." value={form.lrNumber} onChange={(e) => setForm({ ...form, lrNumber: e.target.value })} /></Grid>
        <Grid item xs={12} sm={6}><TextField fullWidth size="small" type="date" label="LR Date" InputLabelProps={{ shrink: true }} value={form.lrDate} onChange={(e) => setForm({ ...form, lrDate: e.target.value })} /></Grid>
        <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="E-Way Bill Number" value={form.ewayBillNumber} onChange={(e) => setForm({ ...form, ewayBillNumber: e.target.value })} /></Grid>
        <Grid item xs={12} sm={6} />
        <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="Driver Name" value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} /></Grid>
        <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="Driver Phone Number" value={form.driverPhone} onChange={(e) => setForm({ ...form, driverPhone: e.target.value })} /></Grid>
      </Grid>
    </Paper>
  );
}

export default function DispatchPage() {
  const [dispatchableBills, setDispatchableBills] = useState<DispatchableBill[]>([]);
  const [parties, setParties] = useState<PartyLedger[]>([]);
  const [dispatches, setDispatches] = useState<DispatchRow[]>([]);
  const [dispatchesTotal, setDispatchesTotal] = useState(0);
  const [dispatchesPage, setDispatchesPage] = useState(0); // MUI TablePagination is 0-indexed
  const [dispatchesRowsPerPage, setDispatchesRowsPerPage] = useState(10);
  const [dispatchesSearchInput, setDispatchesSearchInput] = useState("");
  const [dispatchesSearch, setDispatchesSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDispatchesSearch(dispatchesSearchInput), 300);
    return () => clearTimeout(t);
  }, [dispatchesSearchInput]);
  useEffect(() => { setDispatchesPage(0); }, [dispatchesSearch]);
  const [selectedBillId, setSelectedBillId] = useState("");
  const [dispatchType, setDispatchType] = useState("party_wise");
  // Keyed by lineKey (not item id) - see RemainingLine's comment on why.
  const [qtyByLine, setQtyByLine] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Ship To (defaults to the dealer's own details unless unchecked) and Transport Details -
  // both entered while creating a dispatch, see the backend's buildShipTo/model comments for
  // why these are snapshots rather than live references.
  const [shipToSame, setShipToSame] = useState(true);
  const [shipToForm, setShipToForm] = useState<ShipToForm>({ ...emptyShipToForm });
  const [transportForm, setTransportForm] = useState<TransportForm>({ ...emptyTransportForm });

  const loadData = async () => {
    // allSettled, not all - these three are independent, and Promise.all would let ONE
    // failing/slow request wipe out data that DID load successfully (same bug already fixed
    // in Sales/Purchase/Production - see the matching note in sales/page.tsx's loadData).
    const [billRes, partyRes, dispatchRes] = await Promise.allSettled([
      api.get("/dispatch/dispatchable-bills"),
      api.get("/masters/ledgers", { params: { entityType: "dealer" } }),
      api.get("/dispatch", { params: {
        page: dispatchesPage + 1, limit: dispatchesRowsPerPage,
        search: dispatchesSearch || undefined,
      } }),
    ]);
    if (billRes.status === "fulfilled") setDispatchableBills(billRes.value.data);
    if (partyRes.status === "fulfilled") setParties(partyRes.value.data);
    if (dispatchRes.status === "fulfilled") {
      setDispatches(dispatchRes.value.data.dispatches);
      setDispatchesTotal(dispatchRes.value.data.pagination.total);
    }
  };

  useEffect(() => { loadData(); }, [dispatchesPage, dispatchesRowsPerPage, dispatchesSearch]);

  const selectedBill = dispatchableBills.find((b) => b._id === selectedBillId);
  const selectedParty = selectedBill ? parties.find((p) => p._id === selectedBill.party._id) : undefined;

  const selectBill = (billId: string) => {
    setSelectedBillId(billId);
    const bill = dispatchableBills.find((b) => b._id === billId);
    if (bill) {
      // Default every line to its full remaining quantity, keyed by lineKey so two lines of
      // the same item (different sizes) each get their own independent default - the user can
      // reduce any line for a partial dispatch, but can never type more than what's pending
      // for THAT exact line (enforced both here and, authoritatively, on the backend).
      const defaults: Record<string, string> = {};
      for (const line of bill.items) defaults[line.lineKey] = String(line.remainingQty);
      setQtyByLine(defaults);
    } else {
      setQtyByLine({});
    }
    // A fresh bill selection always starts from "Same as Bill To" with blank transport details
    // - a previous selection's custom shipping address should never silently carry over.
    setShipToSame(true);
    setShipToForm({ ...emptyShipToForm });
    setTransportForm({ ...emptyTransportForm });
  };

  const setLineQty = (lineKey: string, value: string, max: number) => {
    const num = Number(value);
    const clamped = Number.isFinite(num) ? Math.max(0, Math.min(num, max)) : 0;
    setQtyByLine({ ...qtyByLine, [lineKey]: value === "" ? "" : String(clamped) });
  };

  // Lines that will actually be dispatched (qty > 0) - same filter handleCreate uses. Each
  // entry carries its own lineKey (+ variant, when this line has one) so the backend can
  // attribute the quantity to the EXACT line, not just the item - see dispatchController.
  const packingList = selectedBill
    ? selectedBill.items
        .map((line) => ({ item: line.item, variant: line.variant, lineKey: line.lineKey, quantity: Number(qtyByLine[line.lineKey] || 0) }))
        .filter((l) => l.quantity > 0)
    : [];
  const totalDispatchQty = packingList.reduce((sum, l) => sum + l.quantity, 0);

  const handleCreate = async () => {
    if (!selectedBill) return;
    if (packingList.length === 0) return;

    setSaving(true);
    try {
      await api.post("/dispatch", {
        salesBill: selectedBill._id,
        party: selectedBill.party._id,
        dispatchType,
        packingList,
        shipTo: shipToSame ? { sameAsBillTo: true } : { sameAsBillTo: false, ...shipToForm },
        transport: transportForm,
      });
      setSelectedBillId("");
      setQtyByLine({});
      setShipToSame(true);
      setShipToForm({ ...emptyShipToForm });
      setTransportForm({ ...emptyTransportForm });
      setCreateOpen(false);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    await api.put(`/dispatch/${id}/status`, { status });
    await loadData();
  };

  // ---------- Edit Ship To / Transport on an already-created dispatch ----------
  // Separate from New Dispatch above - this never touches packingList/salesBill/party/status,
  // only shipTo/transport (see backend updateDispatchDetails), e.g. to fill in the LR number
  // and vehicle once the truck actually arrives, after the dispatch itself was already created.
  const [editTarget, setEditTarget] = useState<DispatchRow | null>(null);
  const [editShipToSame, setEditShipToSame] = useState(true);
  const [editShipToForm, setEditShipToForm] = useState<ShipToForm>({ ...emptyShipToForm });
  const [editTransportForm, setEditTransportForm] = useState<TransportForm>({ ...emptyTransportForm });
  const [editSaving, setEditSaving] = useState(false);

  const openEditDetails = (d: DispatchRow) => {
    setEditTarget(d);
    setEditShipToSame(d.shipTo?.sameAsBillTo !== false);
    setEditShipToForm({
      name: d.shipTo?.name || "", dealerCode: d.shipTo?.dealerCode || "", address: d.shipTo?.address || "",
      city: d.shipTo?.city || "", state: d.shipTo?.state || "", pincode: d.shipTo?.pincode || "",
      gstin: d.shipTo?.gstin || "", mobile: d.shipTo?.mobile || "",
    });
    setEditTransportForm({
      transporterName: d.transport?.transporterName || "", lrNumber: d.transport?.lrNumber || "",
      lrDate: d.transport?.lrDate ? d.transport.lrDate.slice(0, 10) : "",
      vehicleNumber: d.transport?.vehicleNumber || "", ewayBillNumber: d.transport?.ewayBillNumber || "",
      driverName: d.transport?.driverName || "", driverPhone: d.transport?.driverPhone || "",
    });
  };

  const saveEditDetails = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      await api.put(`/dispatch/${editTarget._id}/details`, {
        shipTo: editShipToSame ? { sameAsBillTo: true } : { sameAsBillTo: false, ...editShipToForm },
        transport: editTransportForm,
      });
      setEditTarget(null);
      await loadData();
    } finally {
      setEditSaving(false);
    }
  };

  // ---------- View/Download the full Tax Invoice (Bill To + Ship To + Transport + items) ----------
  const [invoiceTarget, setInvoiceTarget] = useState<DispatchRow | null>(null);
  const [downloadingCopy, setDownloadingCopy] = useState<string | null>(null);
  const handleDownloadInvoice = async (dispatchId: string, copy: "original" | "duplicate" | "triplicate") => {
    setDownloadingCopy(copy);
    try {
      const res = await api.get(`/dispatch/${dispatchId}/invoice`, { params: { copy }, responseType: "blob" });
      const blobUrl = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      window.open(blobUrl, "_blank");
    } finally {
      setDownloadingCopy(null);
    }
  };

  return (
    <>
      {/* ---------- Page header ---------- */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5} gap={2} flexWrap="wrap">
        <Box display="flex" alignItems="center" gap={1.25}>
          <LocalShippingOutlinedIcon sx={{ fontSize: 34, color: T.greenDark }} />
          <Box>
            <Typography variant="h6" fontWeight={700} lineHeight={1.2} sx={{ color: T.ink }}>Dispatch Management</Typography>
            <Typography variant="caption" color="text.secondary">Dispatch pending sales bill items and track delivery status.</Typography>
          </Box>
        </Box>
        <Button variant="contained" disableElevation startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}
          sx={{ bgcolor: T.greenDark, "&:hover": { bgcolor: T.greenHover }, fontWeight: 700, px: 2.5, height: 36, borderRadius: 1.5 }}>
          New Dispatch
        </Button>
      </Box>

      {/* ---------- Dispatches table ---------- */}
      <Paper variant="outlined" sx={cardSx}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: T.rowBorder, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
          <Typography fontWeight={700} sx={{ color: T.ink }}>Dispatches</Typography>
          <Box display="flex" alignItems="center" gap={1.5}>
            <TextField
              size="small" placeholder="Search dispatch no. or party..." value={dispatchesSearchInput}
              onChange={(e) => setDispatchesSearchInput(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
              sx={{ width: 220, "& .MuiOutlinedInput-root": { height: 32, fontSize: 13 } }}
            />
            <Typography variant="body2" color="text.secondary">{dispatchesTotal} dispatch{dispatchesTotal === 1 ? "" : "es"}</Typography>
          </Box>
        </Box>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ ...tableSx, minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell>Dispatch No</TableCell>
                <TableCell>Sales Bill</TableCell>
                <TableCell>Party</TableCell>
                <TableCell>Items</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dispatches.map((d) => {
                const st = statusStyle[d.status] ?? statusStyle.pending;
                return (
                  <TableRow key={d._id} hover>
                    <TableCell><Typography variant="body2" fontWeight={700} noWrap sx={{ color: T.greenDark }}>{d.dispatchNumber}</Typography></TableCell>
                    <TableCell>{d.salesBill?.billNumber}</TableCell>
                    <TableCell><Typography variant="body2" fontWeight={600} noWrap>{d.party?.name}</Typography></TableCell>
                    <TableCell sx={{ py: 0.75 }}>
                      {d.packingList.map((l, i) => (
                        <Typography key={i} variant="caption" display="block" lineHeight={1.5}>
                          {l.item?.name}{l.variant?.sizeLabel ? ` (${l.variant.sizeLabel})` : ""}: <b>{l.quantity}</b> {l.item?.unit}
                        </Typography>
                      ))}
                    </TableCell>
                    <TableCell><Chip size="small" label={d.dispatchType.replace("_", " ")} sx={{ ...pillSx, bgcolor: T.greyLight, color: T.grey, textTransform: "capitalize" }} /></TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{new Date(d.dispatchDate).toLocaleDateString("en-IN")}</TableCell>
                    <TableCell>
                      {/* Click the chip to change the status (same behaviour as before) */}
                      <TextField select size="small" variant="standard" value={d.status} onChange={(e) => updateStatus(d._id, e.target.value)}
                        InputProps={{ disableUnderline: true }}
                        SelectProps={{
                          renderValue: () => (
                            <Chip size="small" label={d.status.replace("_", " ")} sx={{ ...pillSx, bgcolor: st.bg, color: st.fg, textTransform: "capitalize", cursor: "pointer" }} />
                          ),
                        }}
                        sx={{ "& .MuiSelect-select": { py: 0, display: "flex", alignItems: "center" } }}>
                        <MenuItem value="pending">Pending</MenuItem>
                        <MenuItem value="in_transit">In Transit</MenuItem>
                        <MenuItem value="delivered">Delivered</MenuItem>
                        <MenuItem value="returned">Returned</MenuItem>
                      </TextField>
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Box display="flex" gap={0.25} justifyContent="flex-end">
                        <Tooltip title="Edit Ship To / Transport Details">
                          <IconButton size="small" sx={{ width: 28, height: 28, color: T.greenDark }} onClick={() => openEditDetails(d)}>
                            <EditOutlinedIcon sx={{ fontSize: 17 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="View / Download Invoice">
                          <IconButton size="small" sx={{ width: 28, height: 28, color: T.greenDark }} onClick={() => setInvoiceTarget(d)}>
                            <PictureAsPdfOutlinedIcon sx={{ fontSize: 17 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
              {dispatches.length === 0 && (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4, color: "text.secondary" }}>No dispatches yet - 'New Dispatch' se pehla banao</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div" count={dispatchesTotal} page={dispatchesPage} onPageChange={(_, p) => setDispatchesPage(p)}
          rowsPerPage={dispatchesRowsPerPage} onRowsPerPageChange={(e) => { setDispatchesRowsPerPage(Number(e.target.value)); setDispatchesPage(0); }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </Paper>

      {/* ---------- New Dispatch dialog ---------- */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="md" fullWidth scroll="paper">
        <DialogHeader title="New Dispatch" subtitle="Create a dispatch from a Sales Bill - only pending items are listed." onClose={() => setCreateOpen(false)} />
        <DialogContent dividers sx={{ bgcolor: "#f6faf6", px: 2, py: 2 }}>
          {/* --- Dispatch details --- */}
          <Paper variant="outlined" sx={{ ...cardSx, p: 2, mb: 2, overflow: "visible" }}>
            <Typography sx={sectionLabelSx} mb={1.25}>Dispatch Details</Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={8}>
                <TextField select fullWidth size="small" label="Sales Bill (pending items only)" value={selectedBillId}
                  onChange={(e) => selectBill(e.target.value)}>
                  {dispatchableBills.map((b) => (
                    <MenuItem key={b._id} value={b._id}>{b.billNumber} - {b.party?.name}</MenuItem>
                  ))}
                  {dispatchableBills.length === 0 && <MenuItem value="" disabled>Nothing pending dispatch</MenuItem>}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField select fullWidth size="small" label="Dispatch Type" value={dispatchType}
                  onChange={(e) => setDispatchType(e.target.value)}>
                  <MenuItem value="party_wise">Party-wise</MenuItem>
                  <MenuItem value="office_wise">Office-wise</MenuItem>
                </TextField>
              </Grid>
            </Grid>
            {selectedBill && (
              <Box mt={1.5} display="flex" gap={1} flexWrap="wrap">
                <Chip size="small" label={`Party: ${selectedBill.party?.name}`} sx={{ ...pillSx, bgcolor: T.greyLight, color: T.grey }} />
                <Chip size="small" label={`${selectedBill.items.length} item${selectedBill.items.length === 1 ? "" : "s"} pending`} sx={{ ...pillSx, bgcolor: T.greenLight, color: T.green }} />
              </Box>
            )}
          </Paper>

          {/* --- Quantities --- */}
          {selectedBill ? (
            <>
              <Paper variant="outlined" sx={{ ...cardSx, mb: 2 }}>
                <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: T.rowBorder }}>
                  <Typography sx={sectionLabelSx}>Items to dispatch</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Enter the quantity to dispatch now for each line - it can be less than what remains
                    for a partial dispatch. The rest stays pending for a later dispatch.
                  </Typography>
                </Box>
                <TableContainer sx={{ overflowX: "auto" }}>
                  <Table size="small" sx={tableSx}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Item</TableCell>
                        <TableCell align="right">Billed</TableCell>
                        <TableCell align="right">Already Dispatched</TableCell>
                        <TableCell align="right">Remaining</TableCell>
                        <TableCell align="right">Dispatch Now</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedBill.items.map((line) => (
                        <TableRow key={line.lineKey} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{line.name}</Typography>
                            {line.sizeLabel && <Typography variant="caption" color="text.secondary" display="block">{line.sizeLabel}</Typography>}
                          </TableCell>
                          <TableCell align="right">{line.billedQty} {line.unit}</TableCell>
                          <TableCell align="right">{line.dispatchedQty} {line.unit}</TableCell>
                          <TableCell align="right"><b>{line.remainingQty}</b> {line.unit}</TableCell>
                          <TableCell align="right">
                            <TextField
                              size="small" type="number"
                              sx={{ width: 100, "& .MuiOutlinedInput-root": { bgcolor: "#fff" }, "& .MuiInputBase-input": { py: 0.75, textAlign: "right" } }}
                              inputProps={{ min: 0, max: line.remainingQty }}
                              value={qtyByLine[line.lineKey] ?? ""}
                              onChange={(e) => setLineQty(line.lineKey, e.target.value, line.remainingQty)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>

              <ShipToFields same={shipToSame} setSame={setShipToSame} form={shipToForm} setForm={setShipToForm} billToPreview={selectedParty} />
              <TransportFields form={transportForm} setForm={setTransportForm} />
            </>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 3 }}>
              Upar se Sales Bill chuno - uske pending items yahan dikhenge.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.25 }}>
          {selectedBill && (
            <Typography variant="body2" color="text.secondary" sx={{ mr: "auto" }}>
              {packingList.length} line{packingList.length === 1 ? "" : "s"} · total qty <b>{totalDispatchQty}</b>
            </Typography>
          )}
          <Button size="small" color="inherit" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" disableElevation disabled={saving || !selectedBill || packingList.length === 0} onClick={handleCreate} sx={{ px: 3 }}>
            {saving ? "Creating..." : "Create Dispatch"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---------- Edit Ship To / Transport Details on an existing dispatch ---------- */}
      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} maxWidth="md" fullWidth scroll="paper">
        <DialogHeader
          title={`Edit Dispatch Details - ${editTarget?.dispatchNumber ?? ""}`}
          subtitle="Ship To and Transport Details only - packing list and status are unaffected."
          onClose={() => setEditTarget(null)}
        />
        <DialogContent dividers sx={{ bgcolor: "#f6faf6", px: 2, py: 2 }}>
          <ShipToFields
            same={editShipToSame} setSame={setEditShipToSame} form={editShipToForm} setForm={setEditShipToForm}
            billToPreview={editTarget ? parties.find((p) => p._id === editTarget.party._id) : undefined}
          />
          <TransportFields form={editTransportForm} setForm={setEditTransportForm} />
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.25 }}>
          <Button size="small" color="inherit" onClick={() => setEditTarget(null)}>Cancel</Button>
          <Button variant="contained" color="success" disableElevation disabled={editSaving} onClick={saveEditDetails} sx={{ px: 3 }}>
            {editSaving ? "Saving..." : "Save Details"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---------- View / Download Invoice: pick which copy to print ---------- */}
      <Dialog open={!!invoiceTarget} onClose={() => setInvoiceTarget(null)} maxWidth="xs" fullWidth>
        <DialogHeader title={`Invoice - ${invoiceTarget?.dispatchNumber ?? ""}`} subtitle={invoiceTarget?.salesBill?.billNumber} onClose={() => setInvoiceTarget(null)} />
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" mb={1.5}>
            Choose which copy to open - all three show the same Bill To, Ship To, Transport Details and items.
          </Typography>
          <Box display="flex" flexDirection="column" gap={1}>
            {([
              ["original", "Original for Buyer"],
              ["duplicate", "Duplicate for Transporter"],
              ["triplicate", "Triplicate for Assessee"],
            ] as const).map(([copy, label]) => (
              <Button
                key={copy} variant="outlined" color="success" disabled={!!downloadingCopy}
                onClick={() => invoiceTarget && handleDownloadInvoice(invoiceTarget._id, copy)}
              >
                {downloadingCopy === copy ? "Preparing..." : label}
              </Button>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1 }}>
          <Button size="small" color="inherit" onClick={() => setInvoiceTarget(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}