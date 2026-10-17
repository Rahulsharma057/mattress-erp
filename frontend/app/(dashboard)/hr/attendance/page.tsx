"use client";

import { useEffect, useState } from "react";
import {
  Typography, Box, Grid, TextField, MenuItem, Button, Table, TableHead,
  TableRow, TableCell, TableBody, Paper, TableContainer, Chip,
} from "@mui/material";
import api from "@/lib/api";

interface Employee { _id: string; name: string; }
interface AttendanceLog {
  _id: string;
  employee: { _id: string; name: string };
  date: string;
  status: string;
  overtimeHours: number;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function AttendancePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [form, setForm] = useState({ employee: "", date: todayStr(), status: "present", overtimeHours: 0 });
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    const [empRes, logRes] = await Promise.all([
      api.get("/employees"),
      api.get("/attendance", { params: { from: todayStr(), to: todayStr() } }),
    ]);
    setEmployees(empRes.data);
    setLogs(logRes.data);
  };

  useEffect(() => { loadData(); }, []);

  const handleMark = async () => {
    setSaving(true);
    try {
      await api.post("/attendance", form);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const statusColor: Record<string, "success" | "error" | "warning" | "default"> = {
    present: "success", absent: "error", half_day: "warning", leave: "default", holiday: "default",
  };

  return (
    <>
      <Typography variant="h5" fontWeight={700} mb={3}>Attendance - Daily Entry</Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4}>
            <TextField select fullWidth label="Employee" value={form.employee}
              onChange={(e) => setForm({ ...form, employee: e.target.value })}>
              {employees.map((e) => <MenuItem key={e._id} value={e._id}>{e.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField type="date" fullWidth label="Date" InputLabelProps={{ shrink: true }}
              value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField select fullWidth label="Status" value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <MenuItem value="present">Present</MenuItem>
              <MenuItem value="absent">Absent</MenuItem>
              <MenuItem value="half_day">Half Day</MenuItem>
              <MenuItem value="leave">Leave</MenuItem>
              <MenuItem value="holiday">Holiday</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={2}>
            <Button fullWidth variant="contained" disabled={saving || !form.employee} onClick={handleMark}>
              {saving ? "Saving..." : "Mark"}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Typography variant="subtitle1" fontWeight={600} mb={1}>Today's Log</Typography>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Employee</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Overtime (hrs)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.map((l) => (
              <TableRow key={l._id} hover>
                <TableCell>{l.employee?.name}</TableCell>
                <TableCell><Chip size="small" color={statusColor[l.status]} label={l.status} /></TableCell>
                <TableCell align="right">{l.overtimeHours || 0}</TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableRow><TableCell colSpan={3} align="center">No entries marked today yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="body2" color="text.secondary" mt={3}>
        Monthly summary (for salary generation) is available at <code>GET /api/attendance/summary</code> -
        add a month-picker view here when building the Salary Slip screen.
      </Typography>
    </>
  );
}
