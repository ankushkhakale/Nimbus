"use client";

/**
 * A right-click context menu positioned at the cursor. Closes on outside
 * click, Escape, or scroll. Reuses the same MenuAction shape as the
 * overflow menu so row actions stay defined in one place.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { MenuAction } from "@/components/ui/OverflowMenu";

export interface ContextMenuState {
  x: number;
  y: number;
  actions: MenuAction[];
}

export function ContextMenu({ state, onClose }: { state: ContextMenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: state.x, y: state.y });

  // Keep the menu inside the viewport when opened near an edge.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let { x, y } = state;
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
    setPos({ x: Math.max(8, x), y: Math.max(8, y) });
  }, [state]);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // Capture phase so a click anywhere (including on the triggering row)
    // dismisses before other handlers run.
    document.addEventListener("mousedown", close, true);
    document.addEventListener("scroll", close, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close, true);
      document.removeEventListener("scroll", close, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 340,
        minWidth: 180,
        padding: 6,
        background: "var(--surface-card)",
        border: "1px solid var(--hairline-strong)",
        borderRadius: "var(--radius-md)",
        boxShadow: "0 8px 28px rgba(0,0,0,0.4)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {state.actions.map((action) => (
        <button
          key={action.label}
          type="button"
          role="menuitem"
          disabled={action.disabled}
          onClick={() => {
            onClose();
            action.onClick();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            background: "transparent",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: action.disabled ? "default" : "pointer",
            color: action.destructive ? "var(--error)" : "var(--text-high)",
            fontSize: 14,
            textAlign: "left",
            fontFamily: "inherit",
            opacity: action.disabled ? 0.5 : 1,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-elevated)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {action.icon}
          {action.label}
        </button>
      ))}
    </div>
  );
}
