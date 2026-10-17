
"use client";

import { useEffect, useState } from "react";
import {
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  TableContainer,
  Box,
  Chip,
  IconButton,
  Tooltip,
  Stack,
  Divider,
  CircularProgress,
} from "@mui/material";

import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import CloseIcon from "@mui/icons-material/Close";

import api from "@/lib/api";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useSnackbar } from "@/components/SnackbarProvider";

interface AccountGroup {
  _id: string;
  name: string;
  nature: string;
  parentGroup?: string;
}

const NATURES = [
  "asset",
  "liability",
  "income",
  "expense",
  "equity",
];

const natureColor: Record<
  string,
  "info" | "warning" | "success" | "error" | "default"
> = {
  asset: "info",
  liability: "warning",
  income: "success",
  expense: "error",
  equity: "default",
};

const STANDARD_GROUPS = [
  "Primary",
  "Bank Account",
  "Branch / Division",
  "Capital Account",
  "Cash-in-hand",
  "Current Assets",
  "Current Liabilities",
  "Expenses (Direct)",
  "Expenses (Indirect)",
  "Fixed Assets",
  "Income (Direct)",
  "Income (Indirect)",
  "Loan & Advance",
  "Loan (Liability)",
  "Purchase Account",
  "Sales Account",
  "Stock-in-hand",
  "Sundry Creditors",
  "Sundry Debtors",
  "Tax - CGST",
  "Tax - SGST",
  "Tax - IGST",
];

const inputSx = {
  "& .MuiInputBase-root": {
    fontSize: "0.875rem",
    borderRadius: 1.5,
  },
  "& .MuiInputLabel-root": {
    fontSize: "0.875rem",
  },
};

export default function AccountGroupPage() {
  const { showMessage } = useSnackbar();

  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    nature: "asset",
    parentGroup: "",
  });

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [deleteTarget, setDeleteTarget] =
    useState<AccountGroup | null>(null);

  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    try {
      setLoadError(false);

      const response = await api.get("/masters/account-groups");

      setGroups(
        Array.isArray(response.data) ? response.data : []
      );
    } catch {
      setLoadError(true);
      showMessage("Failed to load account groups", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const openCreate = () => {
    setEditingId(null);

    setForm({
      name: "",
      nature: "asset",
      parentGroup: "",
    });

    setOpen(true);
  };

  const openEdit = (group: AccountGroup) => {
    setEditingId(group._id);

    setForm({
      name: group.name,
      nature: group.nature,
      parentGroup: group.parentGroup || "",
    });

    setOpen(true);
  };

  const handleSave = async () => {
    const name = form.name.trim();

    if (!name) {
      showMessage("Please enter account group name", "error");
      return;
    }

    setSaving(true);

    try {
      if (editingId) {
        await api.put(
          `/masters/account-groups/${editingId}`,
          {
            nature: form.nature,
            parentGroup: form.parentGroup || undefined,
          }
        );

        showMessage("Account group updated", "success");
      } else {
        await api.post("/masters/account-groups", {
          ...form,
          name,
          parentGroup: form.parentGroup || undefined,
        });

        showMessage("Account group created", "success");
      }

      setOpen(false);
      await loadData();
    } catch (error: any) {
      showMessage(
        error?.response?.data?.message ||
          "Failed to save account group",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);

    try {
      await api.delete(
        `/masters/account-groups/${deleteTarget._id}`
      );

      showMessage("Account group deleted", "success");
      setDeleteTarget(null);

      await loadData();
    } catch (error: any) {
      showMessage(
        error?.response?.data?.message ||
          "Failed to delete account group",
        "error"
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box
      sx={{
        width: "100%",
        minWidth: 0,
        color: "text.primary",
      }}
    >
      {/* Compact ERP Header */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        spacing={1.5}
        sx={{ mb: 3 ,mx: 1 }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.25}
          minWidth={0}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 1,
              bgcolor: "primary.main",
              color: "#fff",
            }}
          >
            <AccountTreeOutlinedIcon />
          </Box>

          <Box minWidth={0}>
            <Typography
              variant="h6"
              sx={{
                fontSize: { xs: "1.05rem", sm: "1.2rem" },
                fontWeight: 750,
                lineHeight: 1.4,
              }}
            >
              Account Group Master
            </Typography>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", lineHeight: 1.5 }}
            >
              Manage account categories and their nature
            </Typography>
          </Box>
        </Stack>

<Stack
  direction="row"
  alignItems="center"
  justifyContent="space-between"
  spacing={2}
>
 {/*  <Chip
    size="small"
    label={`${groups.length} Groups`}
    sx={{
      height: 28,
      px: 0.5,
      borderRadius: 1,
      bgcolor: "#F3F4F6",
      color: "#374151",
      border: "1px solid #E5E7EB",
      fontSize: 12,
      fontWeight: 600,
      "& .MuiChip-label": {
        px: 1,
      },
    }}
  /> */}

  <Button
    variant="contained"
    size="medium"
    startIcon={<AddIcon />}
    onClick={openCreate}
    sx={{
      minHeight: 36,
      px: 2,
      borderRadius: 1,
      textTransform: "none",
      fontSize: 13,
      fontWeight: 600,
      boxShadow: "none",
      whiteSpace: "nowrap",
      "&:hover": {
        boxShadow: "none",
      },
    }}
  >
    New Group
  </Button>
</Stack>
      </Stack>

      {/* Table */}
<Paper
  variant="outlined"
  sx={{
    borderRadius: 2,
    overflow: "hidden",
    borderColor: "divider",
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.035)",
    display: "flex",
    flexDirection: "column",
  }}
>
  {/* ===== Fixed Header (no scrollbar here) ===== */}
  <Box sx={{ overflowX: "hidden", bgcolor: "#25851c" }}>
    <Table
      size="small"
      aria-label="Account groups header"
      sx={{
        tableLayout: "fixed",
        minWidth: 540,
        "& .MuiTableCell-root": {
          px: 2,
          py: 1.1,
          bgcolor: "#25851c",
          color: "#f0f5f2",
          fontWeight: 700,
          fontSize: "0.75rem",
          letterSpacing: "0.02em",
          whiteSpace: "nowrap",
          borderBottom: 0,
        },
      }}
    >
      <TableHead>
        <TableRow>
          <TableCell sx={{ width: "36%" }}>Group Name</TableCell>
          <TableCell sx={{ width: "22%" }}>Nature</TableCell>
          <TableCell sx={{ width: "28%" }}>Under Group</TableCell>
          <TableCell align="right" sx={{ width: 110 }}>
            Actions
          </TableCell>
        </TableRow>
      </TableHead>
    </Table>
  </Box>

  {/* ===== Scrollable Body (scrollbar sirf yahan) ===== */}
  <TableContainer
    sx={{
      width: "100%",
      overflowX: "hidden",
      overflowY: "auto",
      maxHeight: "calc(100vh - 275px)",
      minHeight: 180,

      "&::-webkit-scrollbar": { width: 6 },
      "&::-webkit-scrollbar-thumb": {
        backgroundColor: "#B8C5D6",
        borderRadius: 10,
      },
      "&::-webkit-scrollbar-thumb:hover": {
        backgroundColor: "#8497B0",
      },
      "&::-webkit-scrollbar-track": { backgroundColor: "transparent" },

      scrollbarWidth: "thin",
      scrollbarColor: "#B8C5D6 transparent",
    }}
  >
    <Table
      size="small"
      aria-label="Account groups"
      sx={{
        tableLayout: "fixed",
        minWidth: 540,

        "& .MuiTableCell-root": {
          px: 2,
          py: 0.75,
          fontSize: "0.8rem",
          borderColor: "divider",
        },
        "& .MuiTableBody-root .MuiTableCell-root": {
          bgcolor: "background.paper",
        },
        "& .MuiTableBody-root .MuiTableRow-root:nth-of-type(even) .MuiTableCell-root": {
          bgcolor: "#FAFCFB",
        },
        "& .MuiTableBody-root .MuiTableRow-root:last-child .MuiTableCell-root": {
          borderBottom: 0,
        },
        "& .MuiTableBody-root .MuiTableRow-root:hover .MuiTableCell-root": {
          bgcolor: "#EEF6ED",
        },
      }}
    >
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell colSpan={4} align="center">
              <Stack
                direction="row"
                justifyContent="center"
                alignItems="center"
                spacing={1}
                sx={{ py: 4 }}
              >
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">
                  Loading account groups...
                </Typography>
              </Stack>
            </TableCell>
          </TableRow>
        ) : loadError ? (
          <TableRow>
            <TableCell colSpan={4} align="center">
              <Stack spacing={1} alignItems="center" py={3}>
                <Typography variant="body2" color="text.secondary">
                  Unable to load account groups.
                </Typography>
                <Button
                  size="small"
                  onClick={() => void loadData()}
                  sx={{ textTransform: "none" }}
                >
                  Retry
                </Button>
              </Stack>
            </TableCell>
          </TableRow>
        ) : groups.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} align="center">
              <Stack alignItems="center" spacing={0.75} sx={{ py: 4, px: 2 }}>
                <AccountTreeOutlinedIcon
                  sx={{ fontSize: 30, color: "text.disabled" }}
                />
                <Typography variant="body2" fontWeight={650}>
                  No account groups found
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Create your first group to get started.
                </Typography>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={openCreate}
                  sx={{ mt: 0.5, textTransform: "none" }}
                >
                  Create Account Group
                </Button>
              </Stack>
            </TableCell>
          </TableRow>
        ) : (
          groups.map((group) => (
            <TableRow
              key={group._id}
              hover
              sx={{ transition: "background-color 0.15s ease" }}
            >
              {/* Group Name */}
              <TableCell sx={{ width: "36%" }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 650,
                    fontSize: "0.82rem",
                    overflowWrap: "anywhere",
                  }}
                >
                  {group.name}
                </Typography>
              </TableCell>

              {/* Nature */}
            
<TableCell sx={{ width: "22%" }}>
  <Chip
    size="small"
    label={group.nature}
    sx={{
      height: 22,
      minWidth: 68,
      borderRadius: "4px",
      fontSize: "0.7rem",
      fontWeight: 600,
      textTransform: "capitalize",
      bgcolor:
        group.nature === "asset"
          ? "#EAF2FF"
          : group.nature === "liability"
            ? "#FFF2E5"
            : group.nature === "income"
              ? "#E8F7ED"
              : group.nature === "expense"
                ? "#FDECEC"
                : "#F0F1F3",
      color:
        group.nature === "asset"
          ? "#2458A6"
          : group.nature === "liability"
            ? "#A65312"
            : group.nature === "income"
              ? "#217346"
              : group.nature === "expense"
                ? "#B42318"
                : "#4B5563",
      "& .MuiChip-label": {
        px: 1,
      },
    }}
  />
</TableCell>

              {/* Parent Group */}
              <TableCell sx={{ width: "28%" }}>
                <Typography
                  variant="body2"
                  color={group.parentGroup ? "text.primary" : "text.secondary"}
                  sx={{ fontSize: "0.8rem" }}
                >
                  {group.parentGroup || "—"}
                </Typography>
              </TableCell>

              {/* Actions */}
              <TableCell align="right" sx={{ width: 110 }}>
                <Stack
                  direction="row"
                  spacing={0.25}
                  justifyContent="flex-end"
                >
                  <Tooltip title="Edit group">
                    <IconButton
                      size="small"
                      aria-label={`Edit ${group.name}`}
                      onClick={() => openEdit(group)}
                      sx={{
                        color: "primary.main",
                        borderRadius: 1.25,
                        p: 0.75,
                      }}
                    >
                      <EditIcon sx={{ fontSize: 17 }} />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Delete group">
                    <IconButton
                      size="small"
                      aria-label={`Delete ${group.name}`}
                      onClick={() => setDeleteTarget(group)}
                      sx={{
                        color: "error.main",
                        borderRadius: 1.25,
                        p: 0.75,
                      }}
                    >
                      <DeleteIcon sx={{ fontSize: 17 }} />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  </TableContainer>

  {/* ===== Footer (scrollable area ke bahar) ===== */}
  {!loading && !loadError && groups.length > 0 && (
    <Box
      sx={{
        px: 2,
        py: 1.1,
        bgcolor: "#23841f",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 1,
        flexWrap: "wrap",
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: "#fdfdfd", fontWeight: 500 }}
      >
        Total account groups
      </Typography>

      <Typography
        variant="caption"
        sx={{ fontWeight: 700, color: "#fdfdfd" }}
      >
        {groups.length} records
      </Typography>
    </Box>
  )}
</Paper>


      {/* Create / Edit Dialog */}
      <Dialog
        open={open}
        onClose={() => {
          if (!saving) setOpen(false);
        }}
        fullWidth
        maxWidth="xs"
  PaperProps={{
  sx: {
    borderRadius: 2,
    m: 2,
    boxShadow: 8,
  },
}}
      >
        <DialogTitle sx={{ px: 2.5, py: 2 }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
          >
            <Box>
              <Typography
                variant="subtitle1"
                fontWeight={750}
              >
                {editingId
                  ? "Edit Account Group"
                  : "New Account Group"}
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                Configure the group classification
              </Typography>
            </Box>

            <IconButton
              size="small"
              aria-label="Close dialog"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        </DialogTitle>

        <Divider />

        <DialogContent
          sx={{
            px: 2.5,
            py: 2.5,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <TextField
            label="Group Name"
            placeholder="e.g. Sundry Debtors"
            required
            fullWidth
            size="small"
            disabled={!!editingId}
            value={form.name}
            onChange={(e) =>
              setForm({ ...form, name: e.target.value })
            }
            sx={inputSx}
            helperText={
              editingId
                ? "Group name cannot be changed"
                : "Enter a unique account group name"
            }
          />

          <TextField
            select
            label="Nature"
            required
            fullWidth
            size="small"
            value={form.nature}
            onChange={(e) =>
              setForm({ ...form, nature: e.target.value })
            }
            sx={inputSx}
          >
            {NATURES.map((nature) => (
              <MenuItem
                key={nature}
                value={nature}
                sx={{ fontSize: "0.875rem" }}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                >
                  <Box
                    sx={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      bgcolor:
                        nature === "asset"
                          ? "info.main"
                          : nature === "liability"
                            ? "warning.main"
                            : nature === "income"
                              ? "success.main"
                              : nature === "expense"
                                ? "error.main"
                                : "text.secondary",
                    }}
                  />

                  <Typography
                    variant="body2"
                    sx={{ textTransform: "capitalize" }}
                  >
                    {nature}
                  </Typography>
                </Stack>
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Under Group"
            fullWidth
            size="small"
            value={form.parentGroup}
            onChange={(e) =>
              setForm({
                ...form,
                parentGroup: e.target.value,
              })
            }
            sx={inputSx}
            helperText="Select a standard parent category"
          >
            <MenuItem value="" sx={{ fontSize: "0.875rem" }}>
              None
            </MenuItem>

            {STANDARD_GROUPS.map((group) => (
              <MenuItem
                key={group}
                value={group}
                sx={{ fontSize: "0.875rem" }}
              >
                {group}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>

        <Divider />

        <DialogActions sx={{ px: 2.5, py: 1.75, gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            disabled={saving}
            onClick={() => setOpen(false)}
            sx={{
              borderRadius: 1.5,
              textTransform: "none",
            }}
          >
            Cancel
          </Button>

          <Button
            size="small"
            variant="contained"
            disabled={saving || !form.name.trim()}
            onClick={handleSave}
            startIcon={
              saving ? (
                <CircularProgress size={14} color="inherit" />
              ) : undefined
            }
            sx={{
              borderRadius: 1.5,
              textTransform: "none",
              minWidth: 95,
              boxShadow: "none",
              "&:hover": { boxShadow: "none" },
            }}
          >
            {saving
              ? "Saving..."
              : editingId
                ? "Update Group"
                : "Save Group"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Account Group?"
        message={`This will permanently delete "${deleteTarget?.name}". Ledgers using this group will be affected.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />

      {/* Accounting Guidance */}
      <Box
        sx={{
          mt: 1.5,
          px: 1.5,
          py: 1.25,
          border: 1,
          borderColor: "divider",
          borderRadius: 1.5,
          bgcolor: "background.paper",
        }}
      >
        <Typography
          variant="caption"
          fontWeight={750}
          color="text.primary"
        >
          Accounting tip
        </Typography>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: "block",
            mt: 0.4,
            lineHeight: 1.7,
          }}
        >
          Create the required groups before creating ledgers.
          For example, Sundry Debtors (asset), Sundry Creditors
          (liability), Cash/Bank (asset), Sales Account (income)
          and Purchase Account (typically expense). Nature and
          parent category should match your accounting rules.
        </Typography>
      </Box>
    </Box>
  );
}

