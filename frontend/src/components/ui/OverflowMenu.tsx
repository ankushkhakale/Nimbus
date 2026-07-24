"use client";

/**
 * A single "⋮" button that reveals a small action menu.
 *
 * Replaces rows of 2-3 separate icon buttons per file/folder. That
 * pattern actively fought the mobile pass: enlarging icon buttons to a
 * 40px touch target (globals.css, `pointer: coarse`) made three of them
 * per row wider than the touch target fix was meant to solve, crowding
 * out the filename. One menu button is also the same pattern Drive
 * itself uses for row actions, so it doubles as the parity ask.
 */

import React, { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";

export interface MenuAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

export function OverflowMenu({ actions, label = "More actions" }: { actions: MenuAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 30,
          height: 30,
          borderRadius: "var(--radius-md)",
          background: "transparent",
          border: "none",
          color: "var(--text-med)",
          cursor: "pointer",
        }}
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 4px)",
            minWidth: 170,
            padding: 4,
            borderRadius: "var(--radius-md)",
            background: "var(--surface-elevated)",
            border: "1px solid var(--hairline-strong)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            zIndex: 50,
          }}
        >
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              disabled={a.disabled}
              onClick={() => {
                setOpen(false);
                a.onClick();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "9px 10px",
                borderRadius: "var(--radius-sm)",
                background: "transparent",
                border: "none",
                color: a.disabled ? "var(--text-low)" : a.destructive ? "var(--error)" : "var(--text-high)",
                fontSize: 14,
                font: "inherit",
                textAlign: "left",
                cursor: a.disabled ? "not-allowed" : "pointer",
                opacity: a.disabled ? 0.5 : 1,
              }}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
