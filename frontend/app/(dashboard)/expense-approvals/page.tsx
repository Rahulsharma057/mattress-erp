"use client";

import { useEffect, useState } from "react";
import {
  Typography, Box, Table, TableHead, TableRow, TableCell, TableBody,
  Paper, TableContainer, Chip, Button, Stepper, Step, StepLabel,
} from "@mui/material";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

interface Claim {
  _id: string;
  salesman: { name: string };
  date: string;
  category: string;
  amount: number;
  status: "pending" | "admin_approved" | "approved" | "rejected";
  remarks?: string;
  receiptUrl?: string;
}

const STAGES = ["pending", "admin_approved", "approved"];
const statusColor: Record<string, "warning" | "info" | "success" | "error"> = {
  pending: "warning", admin_approved: "info", approved: "success", rejected: "error",
};

export default function ExpenseApprovalsPage() {
  const { user } = useAuthStore();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = async () => setClaims((await api.get("/salesman/expense-claims")).data);
  useEffect(() => { loadData(); }, []);

  const act = async (id: string, status: "approved" | "rejected") => {
    setBusyId(id);
    try {
      await api.put(`/salesman/expense-claims/${id}/review`, { status });
      await loadData();
    } finally {
      setBusyId(null);
    }
  };

  // What this logged-in role can currently do for a given claim
  const canAct = (claim: Claim) => {
    if (claim.status === "approved" || claim.status === "rejected") return false;
    if (user?.role === "admin") return claim.status === "pending";
    if (user?.role === "super_admin") return true; // super_admin can act at either stage
    return false;
  };
  const approveLabel = (claim: Claim) =>
    user?.role === "admin" ? "Admin Approve" : claim.status === "pending" ? "Approve (both stages)" : "Final Approve";

  return (
    <>
      <Typography variant="h5" fontWeight={700} mb={1}>Expense Approvals</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Every claim needs Admin approval first, then Super Admin final approval. Final
        approval auto-posts a Payment voucher against Cash Account.
      </Typography>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Salesman</TableCell>
              <TableCell>Category</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Stage</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {claims.map((c) => (
              <TableRow key={c._id} hover>
                <TableCell>{c.salesman?.name}</TableCell>
                <TableCell><Chip size="small" label={c.category} /></TableCell>
                <TableCell align="right">₹{c.amount}</TableCell>
                <TableCell sx={{ minWidth: 220 }}>
                  {c.status === "rejected" ? (
                    <Chip size="small" color="error" label="Rejected" />
                  ) : (
                    <Stepper activeStep={STAGES.indexOf(c.status)} alternativeLabel sx={{ "& .MuiStepLabel-label": { fontSize: 11 } }}>
                      <Step><StepLabel>Submitted</StepLabel></Step>
                      <Step><StepLabel>Admin</StepLabel></Step>
                      <Step><StepLabel>Super Admin</StepLabel></Step>
                    </Stepper>
                  )}
                </TableCell>
                <TableCell><Chip size="small" color={statusColor[c.status]} label={c.status.replace("_", " ")} /></TableCell>
                <TableCell align="right">
                  {canAct(c) ? (
                    <Box display="flex" gap={1} justifyContent="flex-end">
                      <Button size="small" variant="contained" disabled={busyId === c._id} onClick={() => act(c._id, "approved")}>
                        {approveLabel(c)}
                      </Button>
                      <Button size="small" color="error" disabled={busyId === c._id} onClick={() => act(c._id, "rejected")}>
                        Reject
                      </Button>
                    </Box>
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      {c.status === "approved" ? "Fully approved" : c.status === "rejected" ? "-" : "Waiting on Admin"}
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {claims.length === 0 && <TableRow><TableCell colSpan={6} align="center">No expense claims yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}
