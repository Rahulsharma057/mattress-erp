"use client";

import { useEffect, useState } from "react";
import {
  Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Table, TableHead, TableRow, TableCell, TableBody,
  Paper, TableContainer, Box, Chip, IconButton, Tooltip, Switch, FormControlLabel,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import api from "@/lib/api";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useSnackbar } from "@/components/SnackbarProvider";

interface UserRow {
  _id: string; name: string; email: string; role: string; isActive: boolean; lastLogin?: string;
}

const ROLES = ["super_admin", "admin", "floor_manager", "dispatch_manager", "accountant", "salesman", "dealer", "employee"];
const roleColor: Record<string, "error" | "warning" | "info" | "success" | "default"> = {
  super_admin: "error", admin: "warning", accountant: "info", floor_manager: "info",
  dispatch_manager: "info", salesman: "success", dealer: "success", employee: "default",
};

const emptyForm = { name: "", email: "", password: "", role: "employee", isActive: true };

export default function UsersPage() {
  const { showMessage } = useSnackbar();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => setUsers((await api.get("/users")).data);
  useEffect(() => { loadData(); }, []);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (u: UserRow) => {
    setEditingId(u._id);
    setForm({ name: u.name, email: u.email, password: "", role: u.role, isActive: u.isActive });
    setOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingId) {
        const payload: any = { name: form.name, role: form.role, isActive: form.isActive };
        if (form.password) payload.password = form.password;
        await api.put(`/users/${editingId}`, payload);
        showMessage("User updated", "success");
      } else {
        await api.post("/users", { name: form.name, email: form.email, password: form.password, role: form.role });
        showMessage("User created", "success");
      }
      setOpen(false);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/users/${deleteTarget._id}`);
      showMessage("User deleted", "success");
      setDeleteTarget(null);
      await loadData();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={700}>Users & Role Management</Typography>
        <Button variant="contained" onClick={openCreate}>+ New User</Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell><TableCell>Email</TableCell><TableCell>Role</TableCell>
              <TableCell>Status</TableCell><TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u._id} hover>
                <TableCell>{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell><Chip size="small" color={roleColor[u.role]} label={u.role.replace("_", " ")} /></TableCell>
                <TableCell><Chip size="small" color={u.isActive ? "success" : "default"} label={u.isActive ? "Active" : "Inactive"} /></TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(u)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Delete"><IconButton size="small" onClick={() => setDeleteTarget(u)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && <TableRow><TableCell colSpan={5} align="center">No users yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{editingId ? "Edit User" : "New User"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField label="Email" required disabled={!!editingId} value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <TextField label={editingId ? "New Password (leave blank to keep current)" : "Password"} type="password"
            required={!editingId} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <TextField select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <MenuItem key={r} value={r}>{r.replace("_", " ")}</MenuItem>)}
          </TextField>
          {editingId && (
            <FormControlLabel
              control={<Switch checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />}
              label="Active"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={saving || !form.name || !form.email || (!editingId && !form.password)} onClick={handleSave}>
            {saving ? "Saving..." : editingId ? "Update" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete User?"
        message={`This will permanently delete the login for "${deleteTarget?.name}" (${deleteTarget?.email}).`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
