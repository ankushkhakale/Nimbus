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
  const { isAuthenticated, isRestoring, status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Waiting on `isRestoring` is the whole point: on a reload there is
    // no access token yet, but the refresh cookie may still be valid.
    // Redirecting before that resolves would bounce a signed-in user to
    // the login page every time they refresh the page.
    if (isRestoring || status === "authenticating") return;
    if (!isAuthenticated) router.replace("/auth/login");
  }, [isAuthenticated, isRestoring, status, router]);

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
        {isRestoring ? "Restoring your session…" : "Redirecting to sign in…"}
      </div>
    );
  }

  return <>{children}</>;
}
