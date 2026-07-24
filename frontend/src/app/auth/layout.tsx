import React from "react";
import Link from "next/link";
import { ArrowLeft, Cloud } from "lucide-react";

/**
 * Shared frame for the auth pages. Flat, centred, no decoration.
 *
 * The logo links home, and there is also an explicit "Back to home" link
 * top-left — a logo alone is not an obvious way back for most people.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-container" style={{ position: "relative" }}>
      <Link
        href="/"
        aria-label="Back to home"
        style={{
          position: "absolute",
          top: 24,
          left: 24,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 14,
          fontWeight: 500,
          color: "var(--text-med)",
        }}
      >
        <ArrowLeft size={16} />
        Back to home
      </Link>

      <div
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Link
          href="/"
          className="animate-fade-in-up"
          style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}
        >
          <Cloud size={22} color="var(--primary)" strokeWidth={2.5} />
          <span
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--text-high)",
            }}
          >
            Nimbus
          </span>
        </Link>

        {children}
      </div>
    </div>
  );
}
