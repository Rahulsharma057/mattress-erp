"use client";

import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";

// Green & white production ERP theme - green as the single brand accent (buttons, active
// nav, primary actions), everything else neutral white/grey so financial tables and forms
// stay the visual focus instead of competing with the chrome around them.
const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#2E7D32", dark: "#1B5E20", light: "#66BB6A", contrastText: "#FFFFFF" },
    secondary: { main: "#37474F" }, // neutral slate for secondary emphasis, not a second brand color
    background: { default: "#F4F7F4", paper: "#FFFFFF" },
    text: { primary: "#1B2420", secondary: "#5F6F68" },
    divider: "#E1E8E3",
  },
  shape: { borderRadius: 8 },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" }, // no MUI dark-mode elevation tint bleeding into white cards
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundColor: "#FFFFFF", color: "#1B2420" },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 600 },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 500 },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 700, color: "#37474F", backgroundColor: "#F4F7F4" },
      },
    },
  },
});

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
