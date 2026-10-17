import { create } from "zustand";

export type Role =
  | "super_admin"
  | "admin"
  | "floor_manager"
  | "dispatch_manager"
  | "accountant"
  | "salesman"
  | "dealer"
  | "employee";

interface AuthUser {
  _id: string;
  name: string;
  email: string;
  role: Role;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  setAuth: (user: AuthUser, token: string) => void;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,

  setAuth: (user, token) => {
    localStorage.setItem("mattress_erp_token", token);
    localStorage.setItem("mattress_erp_user", JSON.stringify(user));
    set({ user, token });
  },

  logout: () => {
    localStorage.removeItem("mattress_erp_token");
    localStorage.removeItem("mattress_erp_user");
    set({ user: null, token: null });
  },

  // Call this on app load to restore session from localStorage
  hydrate: () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("mattress_erp_token");
    const userStr = localStorage.getItem("mattress_erp_user");
    if (token && userStr) {
      set({ token, user: JSON.parse(userStr) });
    }
  },
}));
