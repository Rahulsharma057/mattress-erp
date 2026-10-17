"use client";

import { useEffect, useState } from "react";
import {
  Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Table, TableHead, TableRow, TableCell, TableBody,
  Paper, TableContainer, Box, Chip, FormControlLabel, Checkbox, Divider,
  IconButton, Tooltip,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import api from "@/lib/api";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useSnackbar } from "@/components/SnackbarProvider";

interface Department { _id: string; name: string; }
interface Employee {
  _id: string; name: string; designation: string; doj: string;
  basicPay: number; department?: Department; isActive: boolean;
}

const emptyForm = {
  name: "", designation: "", doj: new Date().toISOString().slice(0, 10), basicPay: "",
  department: "", phone: "", email: "",
  createLogin: false, loginEmail: "", loginPassword: "", loginRole: "employee",
};

export default function EmployeeMasterPage() {
  const { showMessage } = useSnackbar();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deptOpen, setDeptOpen] = useState(false);
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [newDept, setNewDept] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteDeptTarget, setDeleteDeptTarget] = useState<Department | null>(null);

  const loadData = async () => {
    const [empRes, deptRes] = await Promise.all([
      api.get("/employees"),
      api.get("/employees/departments"),
    ]);
    setEmployees(empRes.data);
    setDepartments(deptRes.data);
  };

  useEffect(() => { loadData(); }, []);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (e: Employee) => {
    setEditingId(e._id);
    setForm({
      name: e.name, designation: e.designation || "", doj: e.doj?.slice(0, 10) || emptyForm.doj,
      basicPay: String(e.basicPay), department: e.department?._id || "", phone: "", email: "",
      createLogin: false, loginEmail: "", loginPassword: "", loginRole: "employee",
    });
    setOpen(true);
  };

  const handleSaveDept = async () => {
    if (editingDeptId) {
      await api.put(`/employees/departments/${editingDeptId}`, { name: newDept });
      showMessage("Department updated", "success");
    } else {
      await api.post("/employees/departments", { name: newDept });
      showMessage("Department created", "success");
    }
    setNewDept("");
    setEditingDeptId(null);
    setDeptOpen(false);
    await loadData();
  };

  const handleDeleteDept = async () => {
    if (!deleteDeptTarget) return;
    await api.delete(`/employees/departments/${deleteDeptTarget._id}`);
    showMessage("Department deleted", "success");
    setDeleteDeptTarget(null);
    await loadData();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { createLogin, loginEmail, loginPassword, loginRole, basicPay, ...rest } = form;
      const payload: any = { ...rest, basicPay: Number(basicPay), department: form.department || undefined };
      if (editingId) {
        await api.put(`/employees/${editingId}`, payload);
        showMessage("Employee updated", "success");
      } else {
        await api.post("/employees", {
          ...payload, createLogin,
          loginEmail: createLogin ? loginEmail : undefined,
          loginPassword: createLogin ? loginPassword : undefined,
          loginRole: createLogin ? loginRole : undefined,
        });
        showMessage("Employee created", "success");
      }
      setOpen(false);
      setForm(emptyForm);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/employees/${deleteTarget._id}`);
      showMessage("Employee deleted", "success");
      setDeleteTarget(null);
      await loadData();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={700}>Employee Master</Typography>
        <Box display="flex" gap={1}>
          <Button variant="outlined" onClick={() => { setEditingDeptId(null); setNewDept(""); setDeptOpen(true); }}>Manage Departments</Button>
          <Button variant="contained" onClick={openCreate}>+ New Employee</Button>
        </Box>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell><TableCell>Designation</TableCell><TableCell>Department</TableCell>
              <TableCell>DOJ</TableCell><TableCell align="right">Basic Pay</TableCell><TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {employees.map((e) => (
              <TableRow key={e._id} hover>
                <TableCell>{e.name}</TableCell>
                <TableCell>{e.designation || "-"}</TableCell>
                <TableCell>{e.department?.name || "-"}</TableCell>
                <TableCell>{new Date(e.doj).toLocaleDateString("en-IN")}</TableCell>
                <TableCell align="right">₹{e.basicPay?.toLocaleString("en-IN")}</TableCell>
                <TableCell><Chip size="small" color={e.isActive ? "success" : "default"} label={e.isActive ? "Active" : "Inactive"} /></TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(e)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Delete"><IconButton size="small" onClick={() => setDeleteTarget(e)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {employees.length === 0 && <TableRow><TableCell colSpan={7} align="center">No employees yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Manage Departments dialog: list + inline add/edit/delete */}
      <Dialog open={deptOpen} onClose={() => setDeptOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Manage Departments</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Box display="flex" gap={1} mb={2}>
            <TextField fullWidth size="small" label={editingDeptId ? "Rename department" : "New department name"} value={newDept} onChange={(e) => setNewDept(e.target.value)} />
            <Button variant="contained" disabled={!newDept} onClick={handleSaveDept}>{editingDeptId ? "Update" : "Add"}</Button>
          </Box>
          {departments.map((d) => (
            <Box key={d._id} display="flex" justifyContent="space-between" alignItems="center" py={0.5}>
              <Typography variant="body2">{d.name}</Typography>
              <Box>
                <IconButton size="small" onClick={() => { setEditingDeptId(d._id); setNewDept(d.name); }}><EditIcon fontSize="small" /></IconButton>
                <IconButton size="small" onClick={() => setDeleteDeptTarget(d)}><DeleteIcon fontSize="small" /></IconButton>
              </Box>
            </Box>
          ))}
          {departments.length === 0 && <Typography variant="body2" color="text.secondary">No departments yet</Typography>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeptOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deleteDeptTarget}
        title="Delete Department?"
        message={`This will permanently delete "${deleteDeptTarget?.name}".`}
        onConfirm={handleDeleteDept}
        onCancel={() => setDeleteDeptTarget(null)}
      />

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingId ? "Edit Employee" : "New Employee"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField label="Full Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField label="Designation" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
          <TextField select label="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
            <MenuItem value="">- None -</MenuItem>
            {departments.map((d) => <MenuItem key={d._id} value={d._id}>{d.name}</MenuItem>)}
          </TextField>
          <TextField type="date" label="Date of Joining" InputLabelProps={{ shrink: true }} value={form.doj}
            onChange={(e) => setForm({ ...form, doj: e.target.value })} />
          <TextField type="number" label="Basic Pay (monthly)" required value={form.basicPay}
            onChange={(e) => setForm({ ...form, basicPay: e.target.value })} />
          <TextField label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <TextField label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

          {!editingId && (
            <>
              <Divider />
              <FormControlLabel
                control={<Checkbox checked={form.createLogin} onChange={(e) => setForm({ ...form, createLogin: e.target.checked })} />}
                label="Also create a login for this employee"
              />
              {form.createLogin && (
                <>
                  <TextField label="Login Email" required value={form.loginEmail} onChange={(e) => setForm({ ...form, loginEmail: e.target.value })} />
                  <TextField label="Login Password" type="password" required value={form.loginPassword}
                    onChange={(e) => setForm({ ...form, loginPassword: e.target.value })} />
                  <TextField select label="Role" value={form.loginRole} onChange={(e) => setForm({ ...form, loginRole: e.target.value })}>
                    <MenuItem value="employee">Employee</MenuItem>
                    <MenuItem value="floor_manager">Floor Manager</MenuItem>
                    <MenuItem value="dispatch_manager">Dispatch Manager</MenuItem>
                    <MenuItem value="accountant">Accountant</MenuItem>
                    <MenuItem value="salesman">Salesman</MenuItem>
                    <MenuItem value="admin">Admin</MenuItem>
                  </TextField>
                </>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={saving || !form.name || !form.basicPay} onClick={handleSave}>
            {saving ? "Saving..." : editingId ? "Update" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Employee?"
        message={`This will permanently delete "${deleteTarget?.name}"'s employee record. Their login (if any) is not affected.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
