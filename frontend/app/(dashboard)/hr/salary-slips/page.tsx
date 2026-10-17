"use client";

import { useEffect, useState } from "react";
import {
  Typography, Box, Grid, TextField, MenuItem, Button, Table, TableHead,
  TableRow, TableCell, TableBody, Paper, TableContainer, Link as MLink,
} from "@mui/material";
import api from "@/lib/api";

interface Employee { _id: string; name: string; }
interface SalarySlipRow {
  _id: string; employee: { name: string }; month: number; year: number;
  netPay: number; pdfUrl?: string;
}

const now = new Date();

export default function SalarySlipsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [slips, setSlips] = useState<SalarySlipRow[]>([]);
  const [form, setForm] = useState({ employee: "", month: now.getMonth() + 1, year: now.getFullYear(), overtimeRatePerHour: "0" });
  const [generating, setGenerating] = useState(false);

  const loadData = async () => {
    const [empRes, slipRes] = await Promise.all([
      api.get("/employees"),
      api.get("/salary-slips"),
    ]);
    setEmployees(empRes.data);
    setSlips(slipRes.data);
  };

  useEffect(() => { loadData(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await api.post("/salary-slips/generate", {
        employee: form.employee,
        month: Number(form.month),
        year: Number(form.year),
        overtimeRatePerHour: Number(form.overtimeRatePerHour || 0),
      });
      await loadData();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Typography variant="h5" fontWeight={700} mb={3}>Salary Slips</Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4}>
            <TextField select fullWidth label="Employee" value={form.employee}
              onChange={(e) => setForm({ ...form, employee: e.target.value })}>
              {employees.map((e) => <MenuItem key={e._id} value={e._id}>{e.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField fullWidth type="number" label="Month" inputProps={{ min: 1, max: 12 }}
              value={form.month} onChange={(e) => setForm({ ...form, month: Number(e.target.value) })} />
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField fullWidth type="number" label="Year" value={form.year}
              onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} />
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField fullWidth type="number" label="OT Rate/hr" value={form.overtimeRatePerHour}
              onChange={(e) => setForm({ ...form, overtimeRatePerHour: e.target.value })} />
          </Grid>
          <Grid item xs={6} sm={2}>
            <Button fullWidth variant="contained" disabled={generating || !form.employee} onClick={handleGenerate}>
              {generating ? "Generating..." : "Generate"}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Employee</TableCell>
              <TableCell>Month/Year</TableCell>
              <TableCell align="right">Net Pay</TableCell>
              <TableCell>Slip</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {slips.map((s) => (
              <TableRow key={s._id} hover>
                <TableCell>{s.employee?.name}</TableCell>
                <TableCell>{s.month}/{s.year}</TableCell>
                <TableCell align="right">₹{s.netPay.toLocaleString("en-IN")}</TableCell>
                <TableCell>
                  {s.pdfUrl ? <MLink href={s.pdfUrl} target="_blank" rel="noopener">Download PDF</MLink> : "-"}
                </TableCell>
              </TableRow>
            ))}
            {slips.length === 0 && (
              <TableRow><TableCell colSpan={4} align="center">No salary slips generated yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="body2" color="text.secondary" mt={3}>
        Generating pulls attendance for that month, computes pay, renders a PDF, and uploads
        it to Cloudinary (see backend <code>salarySlipController.generateSalarySlip</code>).
        Mark attendance for the employee first via the Attendance screen.
      </Typography>
    </>
  );
}
