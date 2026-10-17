"use client";

import { useEffect, useState } from "react";
import {
  Typography, Box, Table, TableHead, TableRow, TableCell, TableBody,
  Paper, TableContainer, Chip, Button, TextField,
} from "@mui/material";
import api from "@/lib/api";

interface Allocation { salesBill: { _id: string; billNumber: string } | string; amount: number; }
interface Collection {
  _id: string;
  party: { name: string; dealerCode?: string };
  salesman: { name: string };
  date: string;
  amount: number;
  paymentMode: string;
  remarks?: string;
  status: "pending_approval" | "approved" | "rejected";
  rejectionReason?: string;
  allocations?: Allocation[];
}

const AllocationCell = ({ allocations }: { allocations?: Allocation[] }) =>
  allocations && allocations.length > 0 ? (
    <>
      {allocations.map((a, i) => (
        <Typography key={i} variant="caption" display="block">
          {typeof a.salesBill === "object" ? a.salesBill.billNumber : a.salesBill}: ₹{a.amount}
        </Typography>
      ))}
    </>
  ) : (
    <Typography variant="caption" color="text.secondary">On-account</Typography>
  );

const statusColor: Record<string, "warning" | "success" | "error"> = {
  pending_approval: "warning", approved: "success", rejected: "error",
};

export default function CollectionApprovalsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});

  const loadData = async () => setCollections((await api.get("/salesman/collections")).data);
  useEffect(() => { loadData(); }, []);

  const act = async (id: string, status: "approved" | "rejected") => {
    setBusyId(id);
    try {
      await api.put(`/salesman/collections/${id}/review`, {
        status,
        rejectionReason: status === "rejected" ? reasonDraft[id] : undefined,
      });
      await loadData();
    } finally {
      setBusyId(null);
    }
  };

  const pending = collections.filter((c) => c.status === "pending_approval");
  const decided = collections.filter((c) => c.status !== "pending_approval");

  return (
    <>
      <Typography variant="h5" fontWeight={700} mb={1}>Collection Approvals</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        A salesman&apos;s field collection is only a claim until approved here. Approving posts
        exactly one Receipt voucher (settlement ledger Dr, dealer ledger Cr) and reduces the
        dealer&apos;s outstanding. Rejecting never touches the ledger.
      </Typography>

      <Typography variant="subtitle2" fontWeight={700} mb={1}>Pending Approval ({pending.length})</Typography>
      <TableContainer component={Paper} sx={{ mb: 4 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Dealer</TableCell>
              <TableCell>Salesman</TableCell>
              <TableCell>Date</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Payment Mode</TableCell>
              <TableCell>Allocation</TableCell>
              <TableCell>Remarks</TableCell>
              <TableCell align="right">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pending.map((c) => (
              <TableRow key={c._id} hover>
                <TableCell>{c.party?.name} {c.party?.dealerCode ? `(${c.party.dealerCode})` : ""}</TableCell>
                <TableCell>{c.salesman?.name}</TableCell>
                <TableCell>{new Date(c.date).toLocaleDateString("en-IN")}</TableCell>
                <TableCell align="right">₹{c.amount}</TableCell>
                <TableCell><Chip size="small" label={c.paymentMode.replace("_", " ")} /></TableCell>
                <TableCell><AllocationCell allocations={c.allocations} /></TableCell>
                <TableCell>{c.remarks || "-"}</TableCell>
                <TableCell align="right">
                  <Box display="flex" gap={1} justifyContent="flex-end" alignItems="center">
                    <TextField
                      size="small" placeholder="Reason if rejecting" sx={{ width: 160 }}
                      value={reasonDraft[c._id] || ""}
                      onChange={(e) => setReasonDraft({ ...reasonDraft, [c._id]: e.target.value })}
                    />
                    <Button size="small" variant="contained" disabled={busyId === c._id} onClick={() => act(c._id, "approved")}>
                      Approve
                    </Button>
                    <Button size="small" color="error" disabled={busyId === c._id} onClick={() => act(c._id, "rejected")}>
                      Reject
                    </Button>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
            {pending.length === 0 && <TableRow><TableCell colSpan={8} align="center">Nothing pending</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="subtitle2" fontWeight={700} mb={1}>Decided</Typography>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Dealer</TableCell>
              <TableCell>Salesman</TableCell>
              <TableCell>Date</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Payment Mode</TableCell>
              <TableCell>Allocation</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {decided.map((c) => (
              <TableRow key={c._id} hover>
                <TableCell>{c.party?.name}</TableCell>
                <TableCell>{c.salesman?.name}</TableCell>
                <TableCell>{new Date(c.date).toLocaleDateString("en-IN")}</TableCell>
                <TableCell align="right">₹{c.amount}</TableCell>
                <TableCell><Chip size="small" label={c.paymentMode.replace("_", " ")} /></TableCell>
                <TableCell><AllocationCell allocations={c.allocations} /></TableCell>
                <TableCell>
                  <Chip size="small" color={statusColor[c.status]} label={c.status.replace("_", " ")} />
                  {c.status === "rejected" && c.rejectionReason && (
                    <Typography variant="caption" color="text.secondary" display="block">{c.rejectionReason}</Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {decided.length === 0 && <TableRow><TableCell colSpan={7} align="center">No decisions yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}
