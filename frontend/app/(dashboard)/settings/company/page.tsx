"use client";

import { useEffect, useRef, useState } from "react";
import {
  Typography, Box, Grid, TextField, Button, Paper, IconButton, Tooltip, Divider,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SaveIcon from "@mui/icons-material/Save";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import api from "@/lib/api";
import { useSnackbar } from "@/components/SnackbarProvider";
import ConfirmDialog from "@/components/ConfirmDialog";

// Company profile used to fill the header/Bill-To/terms sections of printed invoices (see
// backend models/CompanySettings.js + services/pdfGenerator.js's generateDispatchInvoicePDF)
// instead of hardcoding them. Every field is optional - a section whose fields are all blank
// is simply omitted from the printed invoice, never fabricated.
//
// NOTE: there is deliberately no company bank account here anymore. The invoice's "Payment
// Received In" account is always resolved from the real receiving Ledger (see Ledger Master
// and the backend's dispatchController.resolvePaymentReceivedInfo) - never from a configured
// default here, which could drift from what a payment actually used.
interface CompanySettings {
  name: string;
  addressLine1: string; addressLine2: string;
  gstin: string; phone: string; email: string; website: string;
  termsAndConditions: string[];
  logoUrl?: string;
}

const empty: CompanySettings = {
  name: "", addressLine1: "", addressLine2: "",
  gstin: "", phone: "", email: "", website: "",
  termsAndConditions: [],
};

const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const T = {
  green: "#388e3c",
  greenDark: "#2e7d32",
  greenHover: "#276b2b",
  ink: "#14281b",
  border: "#e3ebe4",
  shadow: "0 1px 3px rgba(20,40,27,0.06)",
};
const cardSx = { borderRadius: 3, borderColor: T.border, boxShadow: T.shadow, bgcolor: "#fff", p: 2.5 } as const;
const sectionLabelSx = { color: T.greenDark, fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 } as const;

export default function CompanySettingsPage() {
  const { showMessage } = useSnackbar();
  const [form, setForm] = useState<CompanySettings>({ ...empty });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/settings/company");
      setForm({ ...empty, ...res.data, termsAndConditions: res.data.termsAndConditions || [] });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // ---------- Company Logo: select -> preview -> upload, or remove ----------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  // Revoke the local object URL when it's replaced/unmounted - otherwise each selection leaks
  // a blob URL for the lifetime of the tab.
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const pickLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      showMessage("Only PNG, JPEG or WebP images are allowed for the company logo", "error");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      showMessage("Logo image must be 2MB or smaller", "error");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const cancelLogoSelection = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const uploadLogo = async () => {
    if (!selectedFile) return;
    setUploadingLogo(true);
    try {
      const body = new FormData();
      body.append("logo", selectedFile);
      const res = await api.post("/settings/company/logo", body, { headers: { "Content-Type": "multipart/form-data" } });
      setForm({ ...empty, ...res.data, termsAndConditions: res.data.termsAndConditions || [] });
      cancelLogoSelection();
      showMessage("Company logo uploaded", "success");
    } finally {
      setUploadingLogo(false);
    }
  };

  const removeLogo = async () => {
    setRemovingLogo(true);
    try {
      const res = await api.delete("/settings/company/logo");
      setForm({ ...empty, ...res.data, termsAndConditions: res.data.termsAndConditions || [] });
      showMessage("Company logo removed", "success");
    } finally {
      setRemovingLogo(false);
      setConfirmRemoveOpen(false);
    }
  };

  const set = (field: keyof CompanySettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value });

  const setTerm = (idx: number, value: string) => {
    const next = [...form.termsAndConditions];
    next[idx] = value;
    setForm({ ...form, termsAndConditions: next });
  };
  const addTerm = () => setForm({ ...form, termsAndConditions: [...form.termsAndConditions, ""] });
  const removeTerm = (idx: number) => setForm({ ...form, termsAndConditions: form.termsAndConditions.filter((_, i) => i !== idx) });

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put("/settings/company", {
        ...form,
        termsAndConditions: form.termsAndConditions.map((t) => t.trim()).filter(Boolean),
      });
      setForm({ ...empty, ...res.data, termsAndConditions: res.data.termsAndConditions || [] });
      showMessage("Company settings saved", "success");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Typography color="text.secondary">Loading...</Typography>;

  return (
    <>
      <Box display="flex" alignItems="center" gap={1.25} mb={2}>
        <SettingsIcon sx={{ fontSize: 34, color: T.greenDark }} />
        <Box>
          <Typography variant="h6" fontWeight={700} lineHeight={1.2} sx={{ color: T.ink }}>Company Settings</Typography>
          <Typography variant="caption" color="text.secondary">
            Used to fill the header and terms on printed Dispatch Invoices. The payment-received account is always resolved from the real receiving ledger, not configured here. Leave anything unknown blank - it's simply left off the printed invoice.
          </Typography>
        </Box>
      </Box>

      <Paper variant="outlined" sx={{ ...cardSx, mb: 2 }}>
        <Typography sx={sectionLabelSx} mb={1.5}>Company Logo</Typography>
        <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
          Shown in the header of printed Dispatch Invoices, next to the company name. PNG, JPEG or WebP, up to 2MB.
        </Typography>
        <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
          <Box
            sx={{
              width: 120, height: 90, borderRadius: 1.5, border: "1px dashed", borderColor: T.border,
              display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", bgcolor: "#fafbfa",
            }}
          >
            {previewUrl || form.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl || form.logoUrl} alt="Company logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            ) : (
              <ImageOutlinedIcon sx={{ color: "text.disabled", fontSize: 32 }} />
            )}
          </Box>

          <Box display="flex" flexDirection="column" gap={1}>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickLogoFile} />
            {selectedFile ? (
              <Box display="flex" gap={1}>
                <Button
                  size="small" variant="contained" color="success" disableElevation
                  startIcon={<CloudUploadOutlinedIcon />} disabled={uploadingLogo} onClick={uploadLogo}
                  sx={{ bgcolor: T.greenDark, "&:hover": { bgcolor: T.greenHover } }}
                >
                  {uploadingLogo ? "Uploading..." : "Upload"}
                </Button>
                <Button size="small" color="inherit" disabled={uploadingLogo} onClick={cancelLogoSelection}>Cancel</Button>
              </Box>
            ) : (
              <Box display="flex" gap={1}>
                <Button size="small" variant="outlined" color="success" onClick={() => fileInputRef.current?.click()}>
                  {form.logoUrl ? "Change Image" : "Choose Image"}
                </Button>
                {form.logoUrl && (
                  <Button size="small" color="error" disabled={removingLogo} onClick={() => setConfirmRemoveOpen(true)}>
                    Remove Logo
                  </Button>
                )}
              </Box>
            )}
            {selectedFile && <Typography variant="caption" color="text.secondary">{selectedFile.name}</Typography>}
          </Box>
        </Box>
      </Paper>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={cardSx}>
            <Typography sx={sectionLabelSx} mb={1.5}>Company Profile</Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={12}><TextField fullWidth size="small" label="Company Name" value={form.name} onChange={set("name")} /></Grid>
              <Grid item xs={12}><TextField fullWidth size="small" label="Address Line 1" value={form.addressLine1} onChange={set("addressLine1")} /></Grid>
              <Grid item xs={12}><TextField fullWidth size="small" label="Address Line 2" value={form.addressLine2} onChange={set("addressLine2")} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="GSTIN" value={form.gstin} onChange={set("gstin")} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="Phone" value={form.phone} onChange={set("phone")} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="Email" value={form.email} onChange={set("email")} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="Website" value={form.website} onChange={set("website")} /></Grid>
            </Grid>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={cardSx}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
              <Typography sx={sectionLabelSx}>Terms & Conditions</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={addTerm}>Add Line</Button>
            </Box>
            <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
              Printed as a numbered list on the invoice. Shown only if at least one line is filled in.
            </Typography>
            {form.termsAndConditions.map((line, idx) => (
              <Box key={idx} display="flex" alignItems="center" gap={1} mb={1}>
                <Typography variant="body2" color="text.secondary" sx={{ width: 20 }}>{idx + 1}.</Typography>
                <TextField fullWidth size="small" value={line} onChange={(e) => setTerm(idx, e.target.value)} placeholder="e.g. Payment Terms: 50% Advance & 50% After Delivery." />
                <Tooltip title="Remove line">
                  <IconButton size="small" color="error" onClick={() => removeTerm(idx)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Tooltip>
              </Box>
            ))}
            {form.termsAndConditions.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>No terms added yet.</Typography>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Divider sx={{ my: 2.5 }} />
      <Box display="flex" justifyContent="flex-end">
        <Button
          variant="contained" color="success" disableElevation startIcon={<SaveIcon />}
          disabled={saving} onClick={save}
          sx={{ bgcolor: T.greenDark, "&:hover": { bgcolor: T.greenHover }, px: 3 }}
        >
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </Box>

      <ConfirmDialog
        open={confirmRemoveOpen}
        title="Remove Company Logo?"
        message="This removes the logo from printed invoices and deletes it from storage. This cannot be undone."
        loading={removingLogo}
        onConfirm={removeLogo}
        onCancel={() => setConfirmRemoveOpen(false)}
      />
    </>
  );
}
