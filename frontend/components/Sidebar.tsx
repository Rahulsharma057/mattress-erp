"use client";

import { List, ListItemButton, ListItemIcon, ListItemText, Drawer, Toolbar, Box, Typography, Divider, Button, Avatar } from "@mui/material";
import { usePathname, useRouter } from "next/navigation";
import DashboardIcon from "@mui/icons-material/Dashboard";
import GroupIcon from "@mui/icons-material/Group";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import SellIcon from "@mui/icons-material/Sell";
import TagIcon from "@mui/icons-material/Tag";
import InventoryIcon from "@mui/icons-material/Inventory2";
import PeopleIcon from "@mui/icons-material/People";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ReceiptIcon from "@mui/icons-material/Receipt";
import FactoryIcon from "@mui/icons-material/Factory";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import StorefrontIcon from "@mui/icons-material/Storefront";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import PaymentsIcon from "@mui/icons-material/Payments";
import BarChartIcon from "@mui/icons-material/BarChart";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import SettingsIcon from "@mui/icons-material/Settings";
import LogoutIcon from "@mui/icons-material/Logout";
import { useAuthStore } from "@/store/authStore";
import { NAV_ITEMS, canSee } from "@/lib/roleConfig";

const DRAWER_WIDTH = 250;

const ICONS: Record<string, React.ReactElement> = {
  dashboard: <DashboardIcon fontSize="small" />,
  group: <GroupIcon fontSize="small" />,
  book: <MenuBookIcon fontSize="small" />,
  tag: <TagIcon fontSize="small" />,
  inventory: <InventoryIcon fontSize="small" />,
  people: <PeopleIcon fontSize="small" />,
  checkCircle: <CheckCircleIcon fontSize="small" />,
  receipt: <ReceiptIcon fontSize="small" />,
  factory: <FactoryIcon fontSize="small" />,
  sell: <SellIcon fontSize="small" />,
  shoppingCart: <ShoppingCartIcon fontSize="small" />,
  localShipping: <LocalShippingIcon fontSize="small" />,
  accountBalance: <AccountBalanceIcon fontSize="small" />,
  storefront: <StorefrontIcon fontSize="small" />,
  factCheck: <FactCheckIcon fontSize="small" />,
  payments: <PaymentsIcon fontSize="small" />,
  barChart: <BarChartIcon fontSize="small" />,
  adminPanel: <AdminPanelSettingsIcon fontSize="small" />,
  settings: <SettingsIcon fontSize="small" />,
};

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const visible = NAV_ITEMS.filter((item) => canSee(item, user?.role));
  const groups: Record<string, typeof visible> = {};
  for (const item of visible) {
    const key = item.group || "";
    groups[key] = groups[key] || [];
    groups[key].push(item);
  }
  const orderedGroups = Object.keys(groups); // insertion order matches NAV_ITEMS order

  const initials = (user?.name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <Drawer
      variant="permanent"
      sx={{ width: DRAWER_WIDTH, flexShrink: 0, "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box", borderRight: "1px solid", borderColor: "divider" } }}
    >
      <Toolbar sx={{ gap: 1 }}>
        <Avatar sx={{ bgcolor: "primary.main", width: 32, height: 32, fontSize: 14 }}>SF</Avatar>
        <Box>
          <Typography variant="subtitle2" fontWeight={700} lineHeight={1.1} noWrap>Sunrise Foam</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>Mattress ERP</Typography>
        </Box>
      </Toolbar>
      <Divider />
      <Box flexGrow={1} overflow="auto" py={1}>
        {orderedGroups.map((group) => (
          <List key={group || "top"} dense subheader={group ? (
            <Typography variant="overline" color="text.secondary" sx={{ pl: 2, fontSize: 11, letterSpacing: 0.5 }}>
              {group}
            </Typography>
          ) : undefined}>
            {groups[group].map((item) => (
              <ListItemButton
                key={item.href}
                selected={pathname === item.href}
                onClick={() => router.push(item.href)}
                sx={{
                  mx: 1, borderRadius: 1.5, mb: 0.25,
                  "&.Mui-selected": { bgcolor: "primary.main", color: "primary.contrastText", "& .MuiListItemIcon-root": { color: "primary.contrastText" } },
                  "&.Mui-selected:hover": { bgcolor: "primary.dark" },
                }}
              >
                <ListItemIcon sx={{ minWidth: 34 }}>{ICONS[item.icon]}</ListItemIcon>
                <ListItemText primaryTypographyProps={{ fontSize: 14 }} primary={item.label} />
              </ListItemButton>
            ))}
          </List>
        ))}
      </Box>
      <Divider />
      <Box p={2} display="flex" alignItems="center" gap={1.5}>
        <Avatar sx={{ width: 32, height: 32, fontSize: 13 }}>{initials}</Avatar>
        <Box flexGrow={1} minWidth={0}>
          <Typography variant="body2" fontWeight={600} noWrap>{user?.name}</Typography>
          <Typography variant="caption" color="text.secondary" textTransform="capitalize" noWrap>{user?.role?.replace("_", " ")}</Typography>
        </Box>
        <Button
          size="small" color="inherit" sx={{ minWidth: 0, p: 0.5 }}
          onClick={() => { logout(); router.push("/login"); }}
        >
          <LogoutIcon fontSize="small" />
        </Button>
      </Box>
    </Drawer>
  );
}
