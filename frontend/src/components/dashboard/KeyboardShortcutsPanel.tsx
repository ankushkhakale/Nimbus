"use client";

import { X } from "lucide-react";

const SHORTCUTS: [string, string][] = [
  ["/", "Focus search"],
  ["Ctrl/Cmd + A", "Select all"],
  ["Delete or Backspace", "Move selection to Trash (or delete forever, in Trash)"],
  ["Escape", "Clear selection / close a dialog"],
  ["?", "Show this panel"],
];

export function KeyboardShortcutsPanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 250,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: 420, padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 16 }}>Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-med)",
              cursor: "pointer",
              display: "flex",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <tbody>
            {SHORTCUTS.map(([key, label]) => (
              <tr key={key} style={{ borderTop: "1px solid var(--hairline)" }}>
                <td style={{ padding: "10px 0", width: "42%" }}>
                  <kbd
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12.5,
                      background: "var(--surface-elevated)",
                      border: "1px solid var(--hairline-strong)",
                      borderRadius: 6,
                      padding: "3px 8px",
                    }}
                  >
                    {key}
                  </kbd>
                </td>
                <td style={{ padding: "10px 0", color: "var(--text-body)" }}>{label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
