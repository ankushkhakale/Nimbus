import React from "react";

import { ProtectedRoute } from "@/components/ProtectedRoute";

/**
 * Guards everything under /dashboard. Applied as a layout so the page
 * itself stays a server component.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
