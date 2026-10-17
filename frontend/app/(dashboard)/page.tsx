"use client";

import { useEffect, useMemo, useState } from "react";
import { Grid, Paper, Typography, Box, Avatar, Chip, TextField, MenuItem } from "@mui/material";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import TodayIcon from "@mui/icons-material/Today";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import StorefrontIcon from "@mui/icons-material/Storefront";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import PaymentsIcon from "@mui/icons-material/Payments";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";

interface SalesDashboard {
  todaysSales: number; todaysSalesCount: number;
  periodSales: number; periodSalesCount: number;
  totalOutstanding: number; totalDealers: number;
  productWiseSales: { name: string; totalAmount: number }[];
  dispatchSummary: Record<string, number>;
}
interface PurchaseDashboard {
  todaysPurchase: number; monthlyPurchase: number; totalPurchaseUptoDate: number;
  totalPaymentPaid: number; totalPaymentPending: number;
}
interface CollectionsSummary {
  pending_approval: { count: number; total: number };
  approved: { count: number; total: number };
  rejected: { count: number; total: number };
}
interface StockReport { lowStock: unknown[]; totalStockValue: number; }
interface Debtor { _id: string; name: string; dealerCode?: string; outstanding: number; creditLimit: number; overLimit: boolean; }
interface PartyBalances { debtors: Debtor[]; totalReceivable: number; totalPayable: number; }

const statusColor: Record<string, "warning" | "info" | "success" | "error"> = {
  pending: "warning", in_transit: "info", delivered: "success", returned: "error",
};

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "all", label: "All Time" },
];

const periodRange = (period: string) => {
  const now = new Date();
  const from = new Date(now);
  if (period === "today") { /* from = now, same day */ }
  else if (period === "week") { from.setDate(now.getDate() - now.getDay()); }
  else if (period === "month") { from.setDate(1); }
  else if (period === "year") { from.setMonth(0, 1); }
  else return {}; // "all" - no bound
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString() };
};

const DASHBOARD_ROLES = ["super_admin", "admin", "accountant", "floor_manager", "dispatch_manager"];

export default function DashboardHome() {
  const user = useAuthStore((s) => s.user);
  const [period, setPeriod] = useState("month");
  const [sales, setSales] = useState<SalesDashboard | null>(null);
  const [purchase, setPurchase] = useState<PurchaseDashboard | null>(null);
  const [collections, setCollections] = useState<CollectionsSummary | null>(null);
  const [stock, setStock] = useState<StockReport | null>(null);
  const [partyBalances, setPartyBalances] = useState<PartyBalances | null>(null);

  const canView = !!user && DASHBOARD_ROLES.includes(user.role);

  useEffect(() => {
    if (!canView) return;
    const params = periodRange(period);
    api.get("/reports/sales-dashboard", { params }).then((res) => setSales(res.data)).catch(() => {});
    api.get("/reports/purchase-dashboard").then((res) => setPurchase(res.data)).catch(() => {});
    api.get("/reports/collections-summary").then((res) => setCollections(res.data)).catch(() => {});
    api.get("/reports/stock").then((res) => setStock(res.data)).catch(() => {});
    api.get("/reports/party-balances").then((res) => setPartyBalances(res.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, period]);

  const overLimitDebtors = partyBalances?.debtors.filter((d) => d.overLimit) || [];
  const topPendingDebtors = (partyBalances?.debtors || []).slice(0, 5);

  const periodLabel = useMemo(() => PERIODS.find((p) => p.value === period)?.label || "", [period]);

  const salesCards = [
    { label: "Today's Sales", value: sales ? `₹${sales.todaysSales.toLocaleString("en-IN")}` : "-", icon: <TodayIcon />, color: "#2E7D32" },
    { label: `Sales - ${periodLabel}`, value: sales ? `₹${sales.periodSales.toLocaleString("en-IN")}` : "-", icon: <TrendingUpIcon />, color: "#1B5E20" },
    { label: "Total Outstanding", value: sales ? `₹${sales.totalOutstanding.toLocaleString("en-IN")}` : "-", icon: <AccountBalanceWalletIcon />, color: "#C62828" },
    { label: "Active Dealers", value: sales ? sales.totalDealers : "-", icon: <StorefrontIcon />, color: "#37474F" },
  ];

  const purchaseCards = purchase ? [
    { label: "Today's Purchase", value: `₹${purchase.todaysPurchase.toLocaleString("en-IN")}` },
    { label: "Monthly Purchase", value: `₹${purchase.monthlyPurchase.toLocaleString("en-IN")}` },
    { label: "Payment Paid", value: `₹${purchase.totalPaymentPaid.toLocaleString("en-IN")}` },
    { label: "Payment Pending", value: `₹${purchase.totalPaymentPending.toLocaleString("en-IN")}` },
  ] : [];

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2} mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700} mb={0.5}>
            {greeting}, {user?.name?.split(" ")[0]}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Here&apos;s what&apos;s happening at Sunrise Foam Industries today.
          </Typography>
        </Box>
        {canView && (
          <TextField select size="small" label="Period" value={period} onChange={(e) => setPeriod(e.target.value)} sx={{ minWidth: 160 }}>
            {PERIODS.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
          </TextField>
        )}
      </Box>

      {canView && partyBalances && (partyBalances.totalReceivable > 0 || overLimitDebtors.length > 0) && (
        <Paper sx={{ p: 2.5, mb: 3, border: "1px solid", borderColor: "warning.main", bgcolor: "#FFF8E1" }}>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <WarningAmberIcon fontSize="small" color="warning" />
            <Typography variant="subtitle1" fontWeight={600}>
              Payment Pending - ₹{partyBalances.totalReceivable.toLocaleString("en-IN")} outstanding from dealers
            </Typography>
          </Box>
          {overLimitDebtors.length > 0 && (
            <Typography variant="body2" color="error.main" mb={1}>
              {overLimitDebtors.length} dealer{overLimitDebtors.length > 1 ? "s are" : " is"} over their credit limit: {overLimitDebtors.map((d) => d.name).join(", ")}
            </Typography>
          )}
          <Box display="flex" gap={1} flexWrap="wrap">
            {topPendingDebtors.map((d) => (
              <Chip key={d._id} size="small" color={d.overLimit ? "error" : "warning"}
                label={`${d.name}: ₹${d.outstanding.toLocaleString("en-IN")}`} />
            ))}
          </Box>
        </Paper>
      )}

      {canView && (
        <>
          <Typography variant="overline" color="text.secondary">Sales</Typography>
          <Grid container spacing={2} mb={3}>
            {salesCards.map((c) => (
              <Grid item xs={12} sm={6} md={3} key={c.label}>
                <Paper sx={{ p: 2.5, display: "flex", alignItems: "center", gap: 2, height: "100%" }}>
                  <Avatar sx={{ bgcolor: `${c.color}1a`, color: c.color, width: 44, height: 44 }}>{c.icon}</Avatar>
                  <Box minWidth={0}>
                    <Typography variant="body2" color="text.secondary" noWrap>{c.label}</Typography>
                    <Typography variant="h6" fontWeight={700} noWrap>{c.value}</Typography>
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>

          <Typography variant="overline" color="text.secondary">Purchase</Typography>
          <Grid container spacing={2} mb={3}>
            {purchaseCards.map((c) => (
              <Grid item xs={12} sm={6} md={3} key={c.label}>
                <Paper sx={{ p: 2.5, display: "flex", alignItems: "center", gap: 2, height: "100%" }}>
                  <Avatar sx={{ bgcolor: "#37474F1a", color: "#37474F", width: 44, height: 44 }}><ShoppingCartIcon /></Avatar>
                  <Box minWidth={0}>
                    <Typography variant="body2" color="text.secondary" noWrap>{c.label}</Typography>
                    <Typography variant="h6" fontWeight={700} noWrap>{c.value}</Typography>
                  </Box>
                </Paper>
              </Grid>
            ))}
            {purchaseCards.length === 0 && <Grid item xs={12}><Typography variant="body2" color="text.secondary">Loading...</Typography></Grid>}
          </Grid>

          <Typography variant="overline" color="text.secondary">Collections &amp; Stock</Typography>
          <Grid container spacing={2} mb={3}>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 2.5, display: "flex", alignItems: "center", gap: 2, height: "100%" }}>
                <Avatar sx={{ bgcolor: "#F9A8251a", color: "#F57C00", width: 44, height: 44 }}><HourglassEmptyIcon /></Avatar>
                <Box minWidth={0}>
                  <Typography variant="body2" color="text.secondary" noWrap>Pending Collection Approval</Typography>
                  <Typography variant="h6" fontWeight={700} noWrap>
                    {collections ? `₹${collections.pending_approval.total.toLocaleString("en-IN")} (${collections.pending_approval.count})` : "-"}
                  </Typography>
                </Box>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 2.5, display: "flex", alignItems: "center", gap: 2, height: "100%" }}>
                <Avatar sx={{ bgcolor: "#2E7D321a", color: "#2E7D32", width: 44, height: 44 }}><PaymentsIcon /></Avatar>
                <Box minWidth={0}>
                  <Typography variant="body2" color="text.secondary" noWrap>Approved Collection</Typography>
                  <Typography variant="h6" fontWeight={700} noWrap>
                    {collections ? `₹${collections.approved.total.toLocaleString("en-IN")} (${collections.approved.count})` : "-"}
                  </Typography>
                </Box>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 2.5, display: "flex", alignItems: "center", gap: 2, height: "100%" }}>
                <Avatar sx={{ bgcolor: "#C628281a", color: "#C62828", width: 44, height: 44 }}><WarningAmberIcon /></Avatar>
                <Box minWidth={0}>
                  <Typography variant="body2" color="text.secondary" noWrap>Low Stock Items</Typography>
                  <Typography variant="h6" fontWeight={700} noWrap>{stock ? stock.lowStock.length : "-"}</Typography>
                </Box>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 2.5, display: "flex", alignItems: "center", gap: 2, height: "100%" }}>
                <Avatar sx={{ bgcolor: "#37474F1a", color: "#37474F", width: 44, height: 44 }}><TrendingUpIcon /></Avatar>
                <Box minWidth={0}>
                  <Typography variant="body2" color="text.secondary" noWrap>Total Stock Value</Typography>
                  <Typography variant="h6" fontWeight={700} noWrap>{stock ? `₹${stock.totalStockValue.toLocaleString("en-IN")}` : "-"}</Typography>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </>
      )}

      {sales && sales.productWiseSales.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} mb={2}>Product-wise Sales - {periodLabel}</Typography>
          <Box sx={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={sales.productWiseSales}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
                <Bar dataKey="totalAmount" fill="#2E7D32" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Paper>
      )}

      {sales && (
        <Paper sx={{ p: 3 }}>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <LocalShippingIcon fontSize="small" color="action" />
            <Typography variant="subtitle1" fontWeight={600}>Dispatching Summary</Typography>
          </Box>
          <Box display="flex" gap={1.5} flexWrap="wrap">
            {Object.entries(sales.dispatchSummary).map(([status, count]) => (
              <Chip
                key={status}
                color={statusColor[status] || "default"}
                label={`${status.replace("_", " ")}: ${count}`}
                sx={{ textTransform: "capitalize", fontWeight: 600 }}
              />
            ))}
            {Object.keys(sales.dispatchSummary).length === 0 && (
              <Typography color="text.secondary" variant="body2">No dispatches yet</Typography>
            )}
          </Box>
        </Paper>
      )}

      {!canView && (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">
            Use the sidebar to access your modules.
          </Typography>
        </Paper>
      )}
    </>
  );
}
