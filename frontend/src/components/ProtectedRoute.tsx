"use client";

/**
 * Client-side guard for authenticated pages.
 *
 * This is a UX measure, not a security boundary — the real enforcement
 * is the JWT check on every API call. A user who bypasses this renders
 * an empty shell, because every request behind it returns 401.
 *
 * Because the token lives in memory only (see auth-context), a page
 * reload lands here unauthenticated and redirects to login.
 */

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated && status !== "authenticating") {
      router.replace("/auth/login");
    }
  }, [isAuthenticated, status, router]);

  if (!isAuthenticated) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-med)",
          fontSize: "15px",
        }}
      >
        Redirecting to sign in…
      </div>
    );
  }

  return <>{children}</>;
}
