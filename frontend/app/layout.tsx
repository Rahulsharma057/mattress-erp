import type { Metadata } from "next";
import ThemeRegistry from "@/components/ThemeRegistry";
import SnackbarProvider from "@/components/SnackbarProvider";

export const metadata: Metadata = {
  title: "Mattress ERP - Sunrise Foam Industries",
  description: "ERP for Foam & Mattress Manufacturing",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry>
          <SnackbarProvider>{children}</SnackbarProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
