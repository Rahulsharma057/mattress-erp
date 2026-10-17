"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Snackbar, Alert } from "@mui/material";

type Severity = "success" | "error" | "info" | "warning";
interface SnackbarContextValue {
  showMessage: (message: string, severity?: Severity) => void;
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

export const useSnackbar = () => {
  const ctx = useContext(SnackbarContext);
  if (!ctx) throw new Error("useSnackbar must be used within SnackbarProvider");
  return ctx;
};

// Lets any component (or the axios interceptor via a module-level ref) show a toast,
// without prop-drilling. This is the standard pattern for "global" UI feedback in Next.js.
let externalShowMessage: ((message: string, severity?: Severity) => void) | null = null;
export const showGlobalMessage = (message: string, severity: Severity = "error") => {
  externalShowMessage?.(message, severity);
};

export default function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ open: boolean; message: string; severity: Severity }>({
    open: false, message: "", severity: "info",
  });

  const showMessage = useCallback((message: string, severity: Severity = "info") => {
    setState({ open: true, message, severity });
  }, []);

  externalShowMessage = showMessage;

  return (
    <SnackbarContext.Provider value={{ showMessage }}>
      {children}
      <Snackbar
        open={state.open}
        autoHideDuration={5000}
        onClose={() => setState((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={state.severity} onClose={() => setState((s) => ({ ...s, open: false }))} sx={{ width: "100%" }}>
          {state.message}
        </Alert>
      </Snackbar>
    </SnackbarContext.Provider>
  );
}
