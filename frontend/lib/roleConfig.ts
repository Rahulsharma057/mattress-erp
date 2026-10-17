// Central place that maps each role to the sidebar sections it can see.
// Keep this in sync with backend allowRoles() checks - frontend hiding is UX only,
// the backend is the real security boundary.
import { Role } from "@/store/authStore";

export interface NavItem {
  label: string;
  href: string;
  roles: Role[];
  icon: string; // key into ICONS map in Sidebar.tsx
  group: string; // sidebar section heading
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", roles: ["super_admin", "admin", "floor_manager", "dispatch_manager", "accountant", "salesman", "dealer", "employee"], icon: "dashboard", group: "" },

  { label: "Account Group", href: "/masters/account-group", roles: ["super_admin", "admin"], icon: "group", group: "Masters" },
  { label: "Ledger", href: "/masters/ledger", roles: ["super_admin", "admin"], icon: "book", group: "Masters" },
  { label: "HSN / SAC", href: "/masters/hsn", roles: ["super_admin", "admin"], icon: "tag", group: "Masters" },
  { label: "Item", href: "/masters/item", roles: ["super_admin", "admin", "floor_manager"], icon: "inventory", group: "Masters" },

  { label: "Employees", href: "/hr/employees", roles: ["super_admin", "admin"], icon: "people", group: "HR" },
  { label: "Attendance", href: "/hr/attendance", roles: ["super_admin", "admin", "floor_manager"], icon: "checkCircle", group: "HR" },
  { label: "Salary Slips", href: "/hr/salary-slips", roles: ["super_admin", "admin"], icon: "receipt", group: "HR" },

  { label: "Work Orders", href: "/production", roles: ["super_admin", "admin", "floor_manager"], icon: "factory", group: "Production" },

  { label: "Sales", href: "/sales", roles: ["super_admin", "admin", "salesman", "dealer"], icon: "sell", group: "Transactions" },
  { label: "Purchase", href: "/purchase", roles: ["super_admin", "admin"], icon: "shoppingCart", group: "Transactions" },
  { label: "Stock", href: "/stock", roles: ["super_admin", "admin", "floor_manager"], icon: "inventory", group: "Transactions" },
  { label: "Dispatch", href: "/dispatch", roles: ["super_admin", "admin", "dispatch_manager"], icon: "localShipping", group: "Transactions" },
  { label: "Vouchers", href: "/accounts", roles: ["super_admin", "admin", "accountant"], icon: "accountBalance", group: "Transactions" },

  { label: "Salesman App", href: "/salesman", roles: ["super_admin", "admin", "salesman"], icon: "storefront", group: "Field Sales" },
  { label: "Collection Approvals", href: "/collection-approvals", roles: ["super_admin", "admin", "accountant"], icon: "payments", group: "Field Sales" },
  { label: "Expense Approvals", href: "/expense-approvals", roles: ["super_admin", "admin"], icon: "factCheck", group: "Field Sales" },

  { label: "Reports", href: "/reports", roles: ["super_admin", "admin", "accountant"], icon: "barChart", group: "Insights" },

  { label: "Users & Roles", href: "/users", roles: ["super_admin"], icon: "adminPanel", group: "Admin" },
  { label: "Company Settings", href: "/settings/company", roles: ["super_admin", "admin"], icon: "settings", group: "Admin" },
];

export const canSee = (item: NavItem, role?: Role) => !!role && item.roles.includes(role);
