"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Paper, TextField, Button, Typography, Alert, Avatar, InputAdornment } from "@mui/material";
import EmailIcon from "@mui/icons-material/Email";
import LockIcon from "@mui/icons-material/Lock";
import BedIcon from "@mui/icons-material/Bed";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setAuth({ _id: data._id, name: data.name, email: data.email, role: data.role }, data.token);
      router.push("/");
    } catch (err: any) {
      setError(err.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      display="flex" minHeight="100vh" alignItems="center" justifyContent="center"
      sx={{ background: "linear-gradient(135deg, #1e3a5f 0%, #16283f 100%)" }}
    >
      <Paper elevation={6} sx={{ p: 4, width: 380, borderRadius: 3 }}>
        <Box display="flex" flexDirection="column" alignItems="center" mb={3}>
          <Avatar sx={{ bgcolor: "primary.main", width: 56, height: 56, mb: 1.5 }}>
            <BedIcon fontSize="medium" />
          </Avatar>
          <Typography variant="h5" fontWeight={700}>Mattress ERP</Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Sunrise Foam Industries / Samraddhi Mattresses
          </Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <form onSubmit={handleSubmit}>
          <TextField
            label="Email" type="email" fullWidth required margin="normal"
            value={email} onChange={(e) => setEmail(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon fontSize="small" color="action" /></InputAdornment> }}
          />
          <TextField
            label="Password" type="password" fullWidth required margin="normal"
            value={password} onChange={(e) => setPassword(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><LockIcon fontSize="small" color="action" /></InputAdornment> }}
          />
          <Button type="submit" variant="contained" fullWidth size="large" sx={{ mt: 3, py: 1.2 }} disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </Paper>
    </Box>
  );
}
