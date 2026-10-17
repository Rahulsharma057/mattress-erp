"use client";

import { Box } from "@mui/material";
import { SWRConfig } from "swr";
import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";
import swrFetcher from "@/lib/swrFetcher";

// SWRConfig's cache lives here, in a layout that stays mounted across every navigation
// between dashboard pages - so a page you've already loaded shows its data instantly on
// revisit, then quietly revalidates in the background.
//
// Layout: fixed viewport height (100dvh). Sidebar stays put, <main> takes the remaining
// width (minWidth: 0 is what stops wide tables from pushing the page sideways) and the
// page inside decides what scrolls.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <SWRConfig value={{ fetcher: swrFetcher, dedupingInterval: 4000, revalidateOnFocus: true, keepPreviousData: true }}>
        <Box sx={{ display: "flex", height: "100dvh", overflow: "hidden", bgcolor: "background.default" }}>
          <Sidebar />
          <Box
            component="main"
            sx={{
              flex: 1,
              minWidth: 0,        // wide table ko right side me fit rakhta hai
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflowX: "hidden",
              overflowY: "auto",  // lambe pages (forms etc.) ke liye
              p: { xs: 1.5, sm: 2.5 },
              bgcolor: "background.default",
              "& > *": { flexShrink: 0 }, // table ko chhota hone (collapse) se rokta hai
            }}
          >
            {children}
          </Box>
        </Box>
      </SWRConfig>
    </AuthGuard>
  );
}