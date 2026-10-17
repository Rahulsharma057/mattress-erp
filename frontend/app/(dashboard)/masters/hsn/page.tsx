
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";

import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";

import api from "@/lib/api";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useSnackbar } from "@/components/SnackbarProvider";

interface Hsn {
  _id: string;
  code: string;
  shortName: string;
  sgst: number;
  cgst: number;
  igst: number;
  type: string;
  unit?: string;
}

interface HsnForm {
  code: string;
  shortName: string;
  sgst: string;
  cgst: string;
  type: string;
  unit: string;
}

const emptyForm: HsnForm = {
  code: "",
  shortName: "",
  sgst: "9",
  cgst: "9",
  type: "goods",
  unit: "PCS",
};

const fieldSx = {
  "& .MuiInputBase-root": {
    borderRadius: 1.5,
    fontSize: 13,
  },
  "& .MuiInputLabel-root": {
    fontSize: 13,
  },
};

export default function HsnMasterPage() {
  const { showMessage } = useSnackbar();

  const [list, setList] = useState<Hsn[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<HsnForm>({ ...emptyForm });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Hsn | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get<Hsn[]>("/masters/hsn");
      setList(Array.isArray(response.data) ? response.data : []);
    } catch (err: unknown) {
      const message =
        typeof err === "object" &&
        err !== null &&
        "response" in err
          ? (
              err as {
                response?: {
                  data?: { message?: string };
                };
              }
            ).response?.data?.message
          : undefined;

      setError(message || "HSN/SAC data load nahi ho saka.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setOpen(true);
  };

  const openEdit = (item: Hsn) => {
    setEditingId(item._id);

    setForm({
      code: item.code || "",
      shortName: item.shortName || "",
      sgst: String(item.sgst ?? 0),
      cgst: String(item.cgst ?? 0),
      type: item.type || "goods",
      unit: item.unit || "PCS",
    });

    setOpen(true);
  };

  const handleSave = async () => {
    const code = form.code.trim();
    const sgst = Number(form.sgst);
    const cgst = Number(form.cgst);

    if (!code) {
      showMessage("HSN/SAC code required hai.", "error");
      return;
    }

    if (
      form.sgst.trim() === "" ||
      form.cgst.trim() === "" ||
      !Number.isFinite(sgst) ||
      !Number.isFinite(cgst) ||
      sgst < 0 ||
      cgst < 0 ||
      sgst > 100 ||
      cgst > 100
    ) {
      showMessage("Valid GST percentage enter karein (0–100).", "error");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        ...form,
        code,
        shortName: form.shortName.trim(),
        sgst,
        cgst,
      };

      if (editingId) {
        await api.put(`/masters/hsn/${editingId}`, payload);
        showMessage("HSN/SAC updated successfully", "success");
      } else {
        await api.post("/masters/hsn", payload);
        showMessage("HSN/SAC created successfully", "success");
      }

      setOpen(false);
      await loadData();
    } catch (err: unknown) {
      const message =
        typeof err === "object" &&
        err !== null &&
        "response" in err
          ? (
              err as {
                response?: {
                  data?: { message?: string };
                };
              }
            ).response?.data?.message
          : undefined;

      showMessage(message || "Save nahi ho saka. Dobara try karein.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);

    try {
      await api.delete(`/masters/hsn/${deleteTarget._id}`);

      showMessage("HSN/SAC deleted successfully", "success");
      setDeleteTarget(null);

      await loadData();
    } catch (err: unknown) {
      const message =
        typeof err === "object" &&
        err !== null &&
        "response" in err
          ? (
              err as {
                response?: {
                  data?: { message?: string };
                };
              }
            ).response?.data?.message
          : undefined;

      showMessage(message || "Delete nahi ho saka.", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box sx={{ width: "100%", minWidth: 0 }}>
      {/* Compact Header */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        gap={1.5}
        mb={2}
        flexWrap="wrap"
      >
        <Stack direction="row" alignItems="center" spacing={1.2}>
          <Box
            sx={{
              width: 38,
              height: 38,
              display: "grid",
              placeItems: "center",
              borderRadius: 2,
              bgcolor: "primary.50",
              color: "primary.main",
              flexShrink: 0,
            }}
          >
            <Inventory2OutlinedIcon fontSize="small" />
          </Box>

          <Box>
            <Typography
              variant="h6"
              fontWeight={750}
              sx={{ fontSize: { xs: 17, sm: 20 }, lineHeight: 1.4 }}
            >
              HSN / SAC Master
            </Typography>

            <Typography variant="caption" color="text.secondary">
              Manage tax codes and GST rates
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={0.8}>
          <Tooltip title="Refresh">
            <span>
              <IconButton
                size="small"
                onClick={() => void loadData()}
                disabled={loading}
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1.5,
                  width: 34,
                  height: 34,
                }}
              >
                <RefreshRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

 <Button
  variant="contained"
  size="small"
  startIcon={<AddRoundedIcon />}
  onClick={openCreate}
  sx={{
    borderRadius: 1,
    px: 1.5,
    minHeight: 34,
    textTransform: "none",
    fontWeight: 650,
    boxShadow: "0px 2px 6px rgba(13, 13, 13, 0.31)",
    "&:hover": {
      boxShadow: "0 4px 10px rgba(13, 13, 14, 0.3)",
    },
    transition: "box-shadow 0.2s ease",
  }}
>
  Add HSN/SAC
</Button>
        </Stack>
      </Stack>

      {/* Summary */}
      <Paper
        variant="outlined"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 1.75,
          py: 1.2,
          mb: 1.5,
          borderRadius: 2,
          borderColor: "divider",
        }}
      >
        <Box>
          <Typography variant="caption" color="text.secondary">
            Total tax codes
          </Typography>

          <Typography variant="h6" fontWeight={750} lineHeight={1.4}>
            {list.length}
          </Typography>
        </Box>

        <Chip
          size="small"
          label="GST Configuration"
          variant="outlined"
          color="primary"
          sx={{ borderRadius: 1.2, fontSize: 11, height: 25 }}
        />
      </Paper>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 1.5, borderRadius: 2, py: 0 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => void loadData()}
            >
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* Data Table */}
      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{
          width: "100%",
          borderRadius: 2,
          borderColor: "divider",
          overflowX: "auto",
          boxShadow: "0 2px 8px rgba(15,23,42,0.035)",
        }}
      >
        <Table
          size="small"
          sx={{
            minWidth: 680,
            "& .MuiTableCell-root": {
              px: 1.75,
              py: 1.15,
              borderColor: "divider",
              fontSize: 12.5,
              whiteSpace: "nowrap",
            },
            "& .MuiTableHead-root .MuiTableCell-root": {
              bgcolor: "green",
              color: "white",
              fontWeight: 750,
              fontSize: 11.5,
              textTransform: "uppercase",
              letterSpacing: 0.35,
              py: 1.3,
            },
            "& .MuiTableBody-root .MuiTableRow-root:last-child td": {
              borderBottom: 0,
            },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell>HSN / SAC Code</TableCell>
              <TableCell>Short Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell align="right">SGST</TableCell>
              <TableCell align="right">CGST</TableCell>
              <TableCell align="right">IGST</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                  <CircularProgress size={24} />

                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    mt={1}
                  >
                    Loading HSN/SAC codes...
                  </Typography>
                </TableCell>
              </TableRow>
            ) : list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Inventory2OutlinedIcon
                    sx={{ fontSize: 30, color: "text.disabled", mb: 0.5 }}
                  />

                  <Typography fontSize={13} fontWeight={650}>
                    No HSN/SAC codes found
                  </Typography>

                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    mt={0.5}
                  >
                    Add a tax code to get started.
                  </Typography>

                  <Button
                    size="small"
                    startIcon={<AddRoundedIcon />}
                    onClick={openCreate}
                    sx={{ mt: 1, textTransform: "none" }}
                  >
                    Add first code
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              list.map((item) => (
                <TableRow
                  key={item._id}
                  hover
                  sx={{ "&:hover": { bgcolor: "action.hover" } }}
                >
                  <TableCell>
                    <Typography
                      component="span"
                      fontSize={12.5}
                      fontWeight={750}
                      color="primary.main"
                    >
                      {item.code}
                    </Typography>
                  </TableCell>

                  <TableCell>{item.shortName || "—"}</TableCell>

                  <TableCell>
                    <Chip
                      size="small"
                      label={item.type === "service" ? "Service" : "Goods"}
                      color={item.type === "service" ? "secondary" : "primary"}
                      variant="outlined"
                      sx={{
                        height: 23,
                        borderRadius: 1,
                        fontSize: 10.5,
                        fontWeight: 650,
                        textTransform: "capitalize",
                      }}
                    />
                  </TableCell>

                  <TableCell align="right">
                    {Number(item.sgst ?? 0)}%
                  </TableCell>

                  <TableCell align="right">
                    {Number(item.cgst ?? 0)}%
                  </TableCell>

                  <TableCell align="right">
                    {Number(
                      item.igst ??
                        Number(item.sgst ?? 0) + Number(item.cgst ?? 0)
                    )}
                    %
                  </TableCell>

                  <TableCell align="center">
                    <Stack
                      direction="row"
                      spacing={0.5}
                      justifyContent="center"
                    >
                      <Tooltip title="Edit code">
                        <IconButton
                          size="small"
                          aria-label="Edit HSN/SAC"
                          onClick={() => openEdit(item)}
                          sx={{
                            width: 29,
                            height: 29,
                            borderRadius: 1.2,
                            color: "primary.main",
                          }}
                        >
                          <EditOutlinedIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                      </Tooltip>

                      <Tooltip title="Delete code">
                        <IconButton
                          size="small"
                          aria-label="Delete HSN/SAC"
                          onClick={() => setDeleteTarget(item)}
                          sx={{
                            width: 29,
                            height: 29,
                            borderRadius: 1.2,
                            color: "error.main",
                          }}
                        >
                          <DeleteOutlineRoundedIcon sx={{ fontSize: 17 }} />
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

      {/* Create / Edit Dialog */}
      <Dialog
        open={open}
        onClose={() => !saving && setOpen(false)}
        fullWidth
        maxWidth="xs"
        PaperProps={{
    sx: {
      borderRadius: 2.5,
      m: 2,
      width: "100%",
      maxWidth: 600,
      boxShadow: "0 12px 40px rgba(15,23,42,0.14)",
    },
  }}

      >
        <DialogTitle sx={{ px: 2.5, py: 1.8 }}>
          <Typography fontSize={16} fontWeight={750}>
            {editingId ? "Edit HSN / SAC" : "Add HSN / SAC"}
          </Typography>

          <Typography variant="caption" color="text.secondary">
            Enter code details and applicable GST rates
          </Typography>
        </DialogTitle>

        <Divider />

        <DialogContent
          sx={{
            px: 2.5,
            py: 2,
            display: "flex",
            flexDirection: "column",
            gap: 1.8,
          }}
        >
          <TextField
            label="HSN / SAC Code"
            required
            size="small"
            fullWidth
            disabled={!!editingId}
            value={form.code}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, code: e.target.value }))
            }
            sx={fieldSx}
          />

          <TextField
            label="Short Name"
            size="small"
            fullWidth
            value={form.shortName}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, shortName: e.target.value }))
            }
            sx={fieldSx}
          />

          <TextField
            select
            label="Type"
            size="small"
            fullWidth
            value={form.type}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, type: e.target.value }))
            }
            sx={fieldSx}
          >
            <MenuItem value="goods">Goods</MenuItem>
            <MenuItem value="service">Service</MenuItem>
          </TextField>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 1.5,
            }}
          >
            <TextField
              label="SGST (%)"
              type="number"
              size="small"
              value={form.sgst}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, sgst: e.target.value }))
              }
inputProps={{
                min: 0,
                max: 100,
                step: 0.1,
              }}
              sx={fieldSx}
            />

            <TextField
              label="CGST (%)"
              type="number"
              size="small"
              value={form.cgst}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, cgst: e.target.value }))
              }
              inputProps={{
    min: 0,
    max: 100,
    step: 0.1,
  }}
              sx={fieldSx}
            />
          </Box>

          <Paper
            variant="outlined"
            sx={{
              px: 1.5,
              py: 1.2,
              borderRadius: 1.5,
              bgcolor: "grey.50",
              borderColor: "divider",
            }}
          >
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Typography variant="caption" color="text.secondary">
                Combined GST (IGST)
              </Typography>

              <Typography fontSize={14} fontWeight={750} color="primary.main">
                {(
                  (Number(form.sgst) || 0) + (Number(form.cgst) || 0)
                )
                  .toFixed(2)
                  .replace(/\.?0+$/, "")}
                %
              </Typography>
            </Stack>
          </Paper>
        </DialogContent>

        <Divider />

        <DialogActions sx={{ px: 2.5, py: 1.5, gap: 0.8 }}>
          <Button
            size="small"
            color="inherit"
            onClick={() => setOpen(false)}
            disabled={saving}
            sx={{ textTransform: "none" }}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            size="small"
            onClick={() => void handleSave()}
            disabled={saving || !form.code.trim()}
            startIcon={
              saving ? (
                <CircularProgress size={14} color="inherit" />
              ) : undefined
            }
            sx={{
              minWidth: 95,
              borderRadius: 1.5,
              textTransform: "none",
              boxShadow: "none",
            }}
          >
            {saving ? "Saving..." : editingId ? "Update" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete HSN/SAC?"
        message={`This will permanently delete "${deleteTarget?.code}". Items using this code may be affected.`}
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </Box>
  );
}

