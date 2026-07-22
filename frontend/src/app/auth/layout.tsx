import React from "react";
import Link from "next/link";
import { Cloud } from "lucide-react";

/**
 * Shared frame for the auth pages. Flat, centred, no decoration — the
 * previous version painted blurred indigo and pink orbs behind the card,
 * which the current system has no place for.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-container">
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
