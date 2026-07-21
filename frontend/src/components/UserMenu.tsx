"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { useAuth } from "@/lib/auth-context";

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  if (!user) return null;

  const handleSignOut = () => {
    logout();
    router.replace("/auth/login");
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${user.full_name} (${user.email})`}
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          background: "var(--surface-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          cursor: "pointer",
          color: "inherit",
          font: "inherit",
        }}
      >
        <span style={{ fontWeight: 600 }}>{initials(user.full_name)}</span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "48px",
            minWidth: "220px",
            padding: "8px",
            borderRadius: "12px",
            background: "var(--surface-2, #1a1a1f)",
            border: "1px solid var(--border-glow, rgba(255,255,255,0.12))",
            boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
            zIndex: 50,
          }}
        >
          <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontWeight: 600, fontSize: "14px" }}>{user.full_name}</div>
            <div style={{ fontSize: "12px", color: "var(--text-med)", wordBreak: "break-all" }}>
              {user.email}
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "100%",
              marginTop: "4px",
              padding: "10px 12px",
              borderRadius: "8px",
              background: "transparent",
              border: "none",
              color: "inherit",
              font: "inherit",
              fontSize: "14px",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
