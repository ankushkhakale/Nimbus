import React from "react";
import Link from "next/link";
import { ArrowLeft, Cloud } from "lucide-react";

/**
 * Shared frame for the auth pages.
 *
 * The back link and the logo share one real header row instead of the
 * back link being absolutely positioned over the page. Absolute
 * positioning combined with vertically-centered content below it looks
 * fine on a tall viewport, but on a short one (a real phone with the
 * browser's address bar still visible, easily under 650px of visible
 * height) the centered logo block sits close enough to the top that it
 * collided with the back link — confirmed by rendering this page at a
 * real 386x650 viewport before this fix.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "20px 24px",
        }}
      >
        <Link
          href="/"
          aria-label="Back to home"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 14,
            fontWeight: 500,
            color: "var(--text-med)",
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={16} />
          <span className="btn-label">Back to home</span>
        </Link>

        <Link
          href="/"
          style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}
        >
          <Cloud size={20} color="var(--primary)" strokeWidth={2.5} />
          <span
            style={{
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--text-high)",
            }}
          >
            Nimbus
          </span>
        </Link>

        {/* Balances the back link so the logo is visually centred rather
            than pushed right by flex space-between with only two items. */}
        <span aria-hidden style={{ width: 92, flexShrink: 0 }} className="auth-header-spacer" />
      </header>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        {children}
      </div>
    </div>
  );
}
