import axios from "axios";
import { showGlobalMessage } from "@/components/SnackbarProvider";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api",
});

// Attach JWT token (stored by the auth store) to every request
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("mattress_erp_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to login on 401 (expired/invalid token); surface every other error as a toast
// so failures are never silent (e.g. a validation error from express-validator).
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("mattress_erp_token");
      localStorage.removeItem("mattress_erp_user");
      window.location.href = "/login";
      return Promise.reject(error);
    }

    const message = error.response?.data?.errors?.[0]?.msg
      || error.response?.data?.message
      || "Something went wrong. Please try again.";
    showGlobalMessage(message, "error");

    return Promise.reject(error);
  }
);

export default api;
