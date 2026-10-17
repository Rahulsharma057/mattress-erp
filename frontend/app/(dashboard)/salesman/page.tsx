"use client";

import { useEffect, useState } from "react";
import {
  Typography, Box, Grid, TextField, MenuItem, Button, Table, TableHead,
  TableRow, TableCell, TableBody, Paper, TableContainer, Chip, Tabs, Tab, Link as MLink, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, InputAdornment, IconButton,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import VisibilityIcon from "@mui/icons-material/Visibility";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

interface Ledger { _id: string; name: string; dealerCode?: string; entityType?: string; creditLimit?: number; currentBalance?: number; salesman?: { name: string }; }
interface LedgerEvent { type: string; date: string; reference: string; description: string; amount: number; drCr: string; runningBalance: number; }
interface DealerSummary {
  openingBalance: number; totalSales: number; totalReceipts: number;
  totalCreditNotes: number; totalDebitNotes: number; currentOutstanding: number; overdueAmount?: number;
}
interface AgingRow { billNumber: string; date: string; dueDate: string; amount: number; received: number; outstandingAmount: number; daysOverdue: number; bucket: string; }
interface DealerHistory {
  salesmanHistory: { salesman?: { name: string }; assignedFrom: string; assignedTo: string | null }[];
  collectionsSummary: Record<string, number>;
  itemsSummary: { name: string; unit: string; totalQty: number; totalAmount: number }[];
}
interface Visit {
  _id: string; party: { name: string }; visitTime: string;
  collectionAmount: number; remarks: string;
  collectionRecord?: { status: string; amount: number };
}
interface ExpenseClaim {
  _id: string; date: string; category: string; amount: number; status: string; remarks: string; receiptUrl?: string;
}
interface Allocation { salesBill: { _id: string; billNumber: string } | string; amount: number; }
interface Collection {
  _id: string; party: { name: string }; date: string; amount: number;
  paymentMode: string; status: "pending_approval" | "approved" | "rejected"; rejectionReason?: string;
  allocations?: Allocation[];
}
interface OpenInvoice { salesBill: string; billNumber: string; outstandingAmount: number; }
interface MySale {
  _id: string; billNumber: string; billType: string; date: string;
  party: { name: string }; totalAmount: number; status: string;
}

const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "neft", label: "NEFT" },
  { value: "rtgs", label: "RTGS" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

const collectionStatusColor: Record<string, "warning" | "success" | "error"> = {
  pending_approval: "warning", approved: "success", rejected: "error",
};

// A dealer with no credit limit set (0) has no enforced ceiling - only flag one that's
// actually over an explicitly configured limit.
const isOverLimit = (l: Ledger) => !!l.creditLimit && l.creditLimit > 0 && (l.currentBalance || 0) > l.creditLimit;

export default function SalesmanPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState(0);
  const [parties, setParties] = useState<Ledger[]>([]);
  const [myDealers, setMyDealers] = useState<Ledger[]>([]);
  const [mySales, setMySales] = useState<MySale[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);

  const [visitForm, setVisitForm] = useState({ party: "", collectionAmount: "0", paymentMode: "cash", remarks: "" });
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [allocForm, setAllocForm] = useState<Record<string, string>>({}); // salesBill -> amount
  const [claimForm, setClaimForm] = useState({ category: "travel", amount: "", remarks: "" });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Dealer Lookup - any salesman can look up ANY dealer's 360 view (read-only), not just
  // their own assigned ones - useful for covering a colleague or checking before a visit.
  const [lookupSearch, setLookupSearch] = useState("");
  const [lookupTarget, setLookupTarget] = useState<Ledger | null>(null);
  const [lookupTab, setLookupTab] = useState(0);
  const [lookupEvents, setLookupEvents] = useState<LedgerEvent[]>([]);
  const [lookupSummary, setLookupSummary] = useState<DealerSummary | null>(null);
  const [lookupAging, setLookupAging] = useState<{ buckets: Record<string, number>; invoices: AgingRow[] } | null>(null);
  const [lookupHistory, setLookupHistory] = useState<DealerHistory | null>(null);

  const loadData = async () => {
    // allSettled, not all - one failing/slow request must not wipe out data that DID load
    // (see the matching note in sales/page.tsx's loadData).
    const [partyRes, dealerRes, salesRes, visitRes, claimRes, collectionRes] = await Promise.allSettled([
      // Only real dealers - previously no entityType filter, so Cash/Bank/Sales Account etc.
      // showed up as if they were dealers a salesman could log a visit/collection against.
      api.get("/masters/ledgers", { params: { entityType: "dealer" } }),
      user?._id ? api.get("/masters/ledgers", { params: { entityType: "dealer", salesman: user._id } }) : Promise.resolve({ data: [] }),
      api.get("/sales"),
      api.get("/salesman/visits"),
      api.get("/salesman/expense-claims"),
      api.get("/salesman/collections"),
    ]);
    if (partyRes.status === "fulfilled") setParties(partyRes.value.data);
    if (dealerRes.status === "fulfilled") setMyDealers(dealerRes.value.data);
    if (salesRes.status === "fulfilled") setMySales(salesRes.value.data);
    if (visitRes.status === "fulfilled") setVisits(visitRes.value.data);
    if (claimRes.status === "fulfilled") setClaims(claimRes.value.data);
    if (collectionRes.status === "fulfilled") setCollections(collectionRes.value.data);
  };

  // A salesman may only log a visit/collection against their OWN assigned dealers - the
  // backend now enforces this too (visitController.createVisit), but offering unassigned
  // dealers here at all invited exactly that mistake. Admin/Super Admin keep the full list,
  // since they may be logging a visit on a salesman's behalf.
  const visitPartyOptions = user?.role === "salesman" ? myDealers : parties;

  useEffect(() => { loadData(); }, []);

  // Whenever the party changes, fetch that dealer's open invoices so a collection can
  // optionally be tied to specific invoice(s) instead of only landing as an on-account amount.
  useEffect(() => {
    setAllocForm({});
    if (!visitForm.party) { setOpenInvoices([]); return; }
    api.get(`/masters/ledgers/${visitForm.party}/open-invoices`).then((res) => setOpenInvoices(res.data));
  }, [visitForm.party]);

  const allocatedTotal = Object.values(allocForm).reduce((t, v) => t + (Number(v) || 0), 0);
  const unallocated = Math.max(0, Number(visitForm.collectionAmount || 0) - allocatedTotal);

  const setAllocation = (salesBill: string, value: string, cap: number) => {
    const num = Number(value);
    const clamped = Number.isFinite(num) ? Math.max(0, Math.min(num, cap)) : 0;
    setAllocForm({ ...allocForm, [salesBill]: value === "" ? "" : String(clamped) });
  };

  const handleLogVisit = async () => {
    setSaving(true);
    try {
      const allocations = Object.entries(allocForm)
        .map(([salesBill, amount]) => ({ salesBill, amount: Number(amount || 0) }))
        .filter((a) => a.amount > 0);

      await api.post("/salesman/visits", {
        party: visitForm.party,
        collectionAmount: Number(visitForm.collectionAmount || 0),
        paymentMode: visitForm.paymentMode,
        allocations,
        remarks: visitForm.remarks,
      });
      setVisitForm({ party: "", collectionAmount: "0", paymentMode: "cash", remarks: "" });
      setAllocForm({});
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleClaim = async () => {
    setSaving(true);
    try {
      let receiptUrl: string | undefined;

      if (receiptFile) {
        setUploading(true);
        const formData = new FormData();
        formData.append("file", receiptFile);
        const uploadRes = await api.post("/uploads", formData, { headers: { "Content-Type": "multipart/form-data" } });
        receiptUrl = uploadRes.data.url;
        setUploading(false);
      }

      await api.post("/salesman/expense-claims", {
        date: new Date().toISOString(),
        category: claimForm.category,
        amount: Number(claimForm.amount),
        remarks: claimForm.remarks,
        receiptUrl,
      });
      setClaimForm({ category: "travel", amount: "", remarks: "" });
      setReceiptFile(null);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const claimStatusColor: Record<string, "warning" | "info" | "success" | "error"> = {
    pending: "warning", admin_approved: "info", approved: "success", rejected: "error",
  };

  const openLookup = async (l: Ledger) => {
    setLookupTarget(l);
    setLookupTab(0);
    setLookupEvents([]); setLookupSummary(null); setLookupAging(null); setLookupHistory(null);
    const [txnRes, agingRes, historyRes] = await Promise.all([
      api.get(`/masters/ledgers/${l._id}/transactions`),
      api.get(`/masters/ledgers/${l._id}/aging`),
      api.get(`/masters/ledgers/${l._id}/dealer-history`),
    ]);
    setLookupEvents(txnRes.data.events);
    setLookupSummary(txnRes.data.summary);
    setLookupAging(agingRes.data);
    setLookupHistory(historyRes.data);
  };

  const filteredParties = parties.filter((p) =>
    p.name.toLowerCase().includes(lookupSearch.toLowerCase()) || p.dealerCode?.toLowerCase().includes(lookupSearch.toLowerCase())
  );

  return (
    <>
      <Typography variant="h5" fontWeight={700} mb={2}>Salesman App</Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Visit Logging" />
        <Tab label="My Dealers" />
        <Tab label="My Sales" />
        <Tab label="Collections" />
        <Tab label="Expense Claims" />
        <Tab label="Dealer Lookup" />
      </Tabs>

      {tab === 0 && (
        <>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={3}>
                <TextField select fullWidth label="Party Visited" value={visitForm.party}
                  onChange={(e) => setVisitForm({ ...visitForm, party: e.target.value })}
                  helperText={user?.role === "salesman" && myDealers.length === 0 ? "No dealers assigned to you yet" : " "}>
                  {visitPartyOptions.map((p) => <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={2}>
                <TextField fullWidth type="number" label="Collection Amount (₹)" value={visitForm.collectionAmount}
                  onChange={(e) => setVisitForm({ ...visitForm, collectionAmount: e.target.value })} />
              </Grid>
              {Number(visitForm.collectionAmount) > 0 && (
                <Grid item xs={12} sm={2}>
                  <TextField select fullWidth label="Payment Mode" value={visitForm.paymentMode}
                    onChange={(e) => setVisitForm({ ...visitForm, paymentMode: e.target.value })}>
                    {PAYMENT_MODES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
                  </TextField>
                </Grid>
              )}
              <Grid item xs={12} sm={3}>
                <TextField fullWidth label="Remarks" value={visitForm.remarks}
                  onChange={(e) => setVisitForm({ ...visitForm, remarks: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={2}>
                <Button fullWidth variant="contained" disabled={saving || !visitForm.party} onClick={handleLogVisit}>
                  Log Visit
                </Button>
              </Grid>
            </Grid>

            {Number(visitForm.collectionAmount) > 0 && openInvoices.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="body2" fontWeight={600} mb={1}>
                  Allocate against invoice(s) - optional
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                  Leave unallocated to record it as an on-account/advance collection instead.
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Invoice</TableCell>
                      <TableCell align="right">Outstanding</TableCell>
                      <TableCell align="right">Allocate Now</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {openInvoices.map((inv) => {
                      const otherLinesTotal = allocatedTotal - (Number(allocForm[inv.salesBill]) || 0);
                      const cap = Math.max(0, Math.min(inv.outstandingAmount, Number(visitForm.collectionAmount || 0) - otherLinesTotal));
                      return (
                        <TableRow key={inv.salesBill}>
                          <TableCell>{inv.billNumber}</TableCell>
                          <TableCell align="right">₹{inv.outstandingAmount}</TableCell>
                          <TableCell align="right">
                            <TextField
                              size="small" type="number" sx={{ width: 110 }}
                              inputProps={{ min: 0, max: cap }}
                              value={allocForm[inv.salesBill] || ""}
                              onChange={(e) => setAllocation(inv.salesBill, e.target.value, cap)}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                  Unallocated (on-account): ₹{unallocated}
                </Typography>
              </>
            )}
          </Paper>

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Party</TableCell>
                  <TableCell>Time</TableCell>
                  <TableCell align="right">Collection</TableCell>
                  <TableCell>Collection Status</TableCell>
                  <TableCell>Remarks</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visits.map((v) => (
                  <TableRow key={v._id} hover>
                    <TableCell>{v.party?.name}</TableCell>
                    <TableCell>{new Date(v.visitTime).toLocaleString("en-IN")}</TableCell>
                    <TableCell align="right">{v.collectionAmount ? `₹${v.collectionAmount}` : "-"}</TableCell>
                    <TableCell>
                      {v.collectionRecord ? (
                        <Chip size="small" color={collectionStatusColor[v.collectionRecord.status]} label={v.collectionRecord.status.replace("_", " ")} />
                      ) : "-"}
                    </TableCell>
                    <TableCell>{v.remarks || "-"}</TableCell>
                  </TableRow>
                ))}
                {visits.length === 0 && <TableRow><TableCell colSpan={5} align="center">No visits logged yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="body2" color="text.secondary" mt={2}>
            A collection amount logged here goes to Accounts as <b>pending approval</b> - it does
            not touch the ledger yet. Once an Accountant/Admin approves it (Collections tab, or
            the Collection Approvals screen), exactly one Receipt voucher is posted and the
            party&apos;s outstanding drops.
          </Typography>
        </>
      )}

      {tab === 1 && (
        <>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Dealers currently assigned to you. Keep an eye on Available Credit before taking a
            new order - a bill that exceeds it will be blocked unless an Accountant/Admin overrides it.
          </Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Dealer</TableCell>
                  <TableCell align="right">Credit Limit</TableCell>
                  <TableCell align="right">Outstanding</TableCell>
                  <TableCell align="right">Available Credit</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {myDealers.map((d) => {
                  const available = (d.creditLimit || 0) - (d.currentBalance || 0);
                  return (
                    <TableRow key={d._id} hover>
                      <TableCell>{d.name} {d.dealerCode ? `(${d.dealerCode})` : ""}</TableCell>
                      <TableCell align="right">{d.creditLimit ? `₹${d.creditLimit.toLocaleString("en-IN")}` : "-"}</TableCell>
                      <TableCell align="right">₹{(d.currentBalance || 0).toLocaleString("en-IN")}</TableCell>
                      <TableCell align="right">{d.creditLimit ? `₹${available.toLocaleString("en-IN")}` : "-"}</TableCell>
                      <TableCell>
                        {isOverLimit(d) ? <Chip size="small" color="error" label="Over Limit" /> : <Chip size="small" color="success" label="OK" />}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {myDealers.length === 0 && <TableRow><TableCell colSpan={5} align="center">No dealers assigned to you yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {tab === 2 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Bill No</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Party</TableCell>
                <TableCell>Date</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mySales.map((s) => (
                <TableRow key={s._id} hover>
                  <TableCell>{s.billNumber}</TableCell>
                  <TableCell><Chip size="small" label={s.billType.replace("_", " ")} /></TableCell>
                  <TableCell>{s.party?.name}</TableCell>
                  <TableCell>{new Date(s.date).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell align="right">₹{s.totalAmount.toLocaleString("en-IN")}</TableCell>
                  <TableCell><Chip size="small" label={s.status} /></TableCell>
                </TableRow>
              ))}
              {mySales.length === 0 && <TableRow><TableCell colSpan={6} align="center">No sales recorded against you yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {tab === 3 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Party</TableCell>
                <TableCell>Date</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Payment Mode</TableCell>
                <TableCell>Allocation</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {collections.map((c) => (
                <TableRow key={c._id} hover>
                  <TableCell>{c.party?.name}</TableCell>
                  <TableCell>{new Date(c.date).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell align="right">₹{c.amount}</TableCell>
                  <TableCell><Chip size="small" label={c.paymentMode.replace("_", " ")} /></TableCell>
                  <TableCell>
                    {c.allocations && c.allocations.length > 0 ? (
                      c.allocations.map((a, i) => (
                        <Typography key={i} variant="caption" display="block">
                          {typeof a.salesBill === "object" ? a.salesBill.billNumber : a.salesBill}: ₹{a.amount}
                        </Typography>
                      ))
                    ) : (
                      <Typography variant="caption" color="text.secondary">On-account</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" color={collectionStatusColor[c.status]} label={c.status.replace("_", " ")} />
                    {c.status === "rejected" && c.rejectionReason && (
                      <Typography variant="caption" color="text.secondary" display="block">{c.rejectionReason}</Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {collections.length === 0 && <TableRow><TableCell colSpan={6} align="center">No collections yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {tab === 4 && (
        <>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={3}>
                <TextField select fullWidth label="Category" value={claimForm.category}
                  onChange={(e) => setClaimForm({ ...claimForm, category: e.target.value })}>
                  <MenuItem value="travel">Travel</MenuItem>
                  <MenuItem value="food">Food</MenuItem>
                  <MenuItem value="lodging">Lodging</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField fullWidth type="number" label="Amount (₹)" value={claimForm.amount}
                  onChange={(e) => setClaimForm({ ...claimForm, amount: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField fullWidth label="Remarks" value={claimForm.remarks}
                  onChange={(e) => setClaimForm({ ...claimForm, remarks: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={3}>
                <Button component="label" fullWidth variant="outlined">
                  {receiptFile ? receiptFile.name.slice(0, 18) : "Attach Receipt"}
                  <input type="file" hidden accept="image/*,application/pdf"
                    onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} />
                </Button>
              </Grid>
              <Grid item xs={12} sm={2}>
                <Button fullWidth variant="contained" disabled={saving || uploading || !claimForm.amount} onClick={handleClaim}>
                  {uploading ? "Uploading..." : saving ? "Saving..." : "Submit"}
                </Button>
              </Grid>
            </Grid>
          </Paper>

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Receipt</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {claims.map((c) => (
                  <TableRow key={c._id} hover>
                    <TableCell>{new Date(c.date).toLocaleDateString("en-IN")}</TableCell>
                    <TableCell><Chip size="small" label={c.category} /></TableCell>
                    <TableCell align="right">₹{c.amount}</TableCell>
                    <TableCell>{c.receiptUrl ? <MLink href={c.receiptUrl} target="_blank" rel="noopener">View</MLink> : "-"}</TableCell>
                    <TableCell><Chip size="small" color={claimStatusColor[c.status]} label={c.status.replace("_", " ")} /></TableCell>
                  </TableRow>
                ))}
                {claims.length === 0 && <TableRow><TableCell colSpan={5} align="center">No claims submitted yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {tab === 5 && (
        <>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Look up any dealer - not just your own assigned ones - to check their outstanding,
            aging, and history before a visit or when covering for a colleague. Read-only.
          </Typography>
          <TextField
            fullWidth size="small" placeholder="Search by name or dealer code..." value={lookupSearch}
            onChange={(e) => setLookupSearch(e.target.value)} sx={{ mb: 2, maxWidth: 360 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Code</TableCell><TableCell>Name</TableCell><TableCell>Salesman</TableCell>
                  <TableCell align="right">Outstanding</TableCell><TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredParties.slice(0, 50).map((p) => (
                  <TableRow key={p._id} hover>
                    <TableCell>{p.dealerCode}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>{p.salesman?.name || "-"}</TableCell>
                    <TableCell align="right">₹{(p.currentBalance || 0).toLocaleString("en-IN")}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => openLookup(p)}><VisibilityIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredParties.length === 0 && <TableRow><TableCell colSpan={5} align="center">No dealers found</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      <Dialog open={!!lookupTarget} onClose={() => setLookupTarget(null)} fullWidth maxWidth="md">
        <DialogTitle>
          {lookupTarget?.name} - Dealer 360 (Read-only)
          <Typography variant="body2" color="text.secondary">{lookupTarget?.dealerCode}</Typography>
        </DialogTitle>
        {lookupSummary && (
          <Box px={3} pb={1} display="flex" gap={1} flexWrap="wrap">
            <Chip size="small" label={`Sales ₹${lookupSummary.totalSales.toLocaleString("en-IN")}`} />
            <Chip size="small" color="success" label={`Receipts ₹${lookupSummary.totalReceipts.toLocaleString("en-IN")}`} />
            <Chip size="small" color="primary" label={`Outstanding ₹${lookupSummary.currentOutstanding.toLocaleString("en-IN")}`} />
            {lookupSummary.overdueAmount !== undefined && (
              <Chip size="small" color={lookupSummary.overdueAmount > 0 ? "error" : "success"} label={`Overdue ₹${lookupSummary.overdueAmount.toLocaleString("en-IN")}`} />
            )}
          </Box>
        )}
        <Tabs value={lookupTab} onChange={(_, v) => setLookupTab(v)} sx={{ px: 3, borderBottom: 1, borderColor: "divider" }}>
          <Tab label="Ledger" /><Tab label="Aging" /><Tab label="History" />
        </Tabs>
        <DialogContent>
          {lookupTab === 0 && (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow><TableCell>Date</TableCell><TableCell>Type</TableCell><TableCell>Reference</TableCell><TableCell align="right">Amount</TableCell><TableCell align="right">Balance</TableCell></TableRow>
                </TableHead>
                <TableBody>
                  {lookupEvents.map((e, i) => (
                    <TableRow key={i} hover>
                      <TableCell>{new Date(e.date).toLocaleDateString("en-IN")}</TableCell>
                      <TableCell><Chip size="small" label={e.type.replace("_", " ")} /></TableCell>
                      <TableCell>{e.reference}</TableCell>
                      <TableCell align="right">{e.drCr === "debit" ? "+" : "-"}₹{e.amount.toLocaleString("en-IN")}</TableCell>
                      <TableCell align="right">₹{e.runningBalance.toLocaleString("en-IN")}</TableCell>
                    </TableRow>
                  ))}
                  {lookupEvents.length === 0 && <TableRow><TableCell colSpan={5} align="center">No transactions yet</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {lookupTab === 1 && (
            <>
              <Box display="flex" gap={1} flexWrap="wrap" mb={2}>
                {lookupAging && Object.entries(lookupAging.buckets).map(([b, amt]) => (
                  <Chip key={b} size="small" label={`${b}: ₹${amt.toLocaleString("en-IN")}`} />
                ))}
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow><TableCell>Invoice</TableCell><TableCell align="right">Outstanding</TableCell><TableCell align="right">Days</TableCell><TableCell>Bucket</TableCell></TableRow>
                  </TableHead>
                  <TableBody>
                    {lookupAging?.invoices.map((inv, i) => (
                      <TableRow key={i} hover>
                        <TableCell>{inv.billNumber}</TableCell>
                        <TableCell align="right">₹{inv.outstandingAmount.toLocaleString("en-IN")}</TableCell>
                        <TableCell align="right">{inv.daysOverdue > 0 ? inv.daysOverdue : "-"}</TableCell>
                        <TableCell>{inv.bucket}</TableCell>
                      </TableRow>
                    ))}
                    {(!lookupAging || lookupAging.invoices.length === 0) && <TableRow><TableCell colSpan={4} align="center">No open invoices</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
          {lookupTab === 2 && (
            <>
              <Typography variant="subtitle2" fontWeight={700} mb={1}>Salesman Assignment History</Typography>
              {lookupHistory?.salesmanHistory.map((h, i) => (
                <Typography key={i} variant="body2" mb={0.5}>
                  {h.salesman?.name || "Unassigned"} - {new Date(h.assignedFrom).toLocaleDateString("en-IN")} to {h.assignedTo ? new Date(h.assignedTo).toLocaleDateString("en-IN") : "present"}
                </Typography>
              ))}
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" fontWeight={700} mb={1}>Items Bought</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead><TableRow><TableCell>Item</TableCell><TableCell align="right">Qty</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead>
                  <TableBody>
                    {lookupHistory?.itemsSummary.map((it, i) => (
                      <TableRow key={i}><TableCell>{it.name}</TableCell><TableCell align="right">{it.totalQty} {it.unit}</TableCell><TableCell align="right">₹{it.totalAmount.toLocaleString("en-IN")}</TableCell></TableRow>
                    ))}
                    {(!lookupHistory || lookupHistory.itemsSummary.length === 0) && <TableRow><TableCell colSpan={3} align="center">Nothing bought yet</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setLookupTarget(null)}>Close</Button></DialogActions>
      </Dialog>
    </>
  );
}
