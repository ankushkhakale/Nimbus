"use client";

/**
 * A transient toast offering to reverse the last action (trash, move).
 * Auto-dismisses after a few seconds; clicking Undo runs the reversal
 * the caller supplied. Kept deliberately simple — one toast at a time,
 * replacing any previous one.
 */

import { useEffect, useState } from "react";
import { RotateCcw, X } from "lucide-react";

export interface UndoAction {
  /** Distinguishes successive toasts so the auto-dismiss timer resets. */
  key: string;
  message: string;
  run: () => void | Promise<void>;
}

export function UndoToast({ action, onDismiss }: { action: UndoAction; onDismiss: () => void }) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(onDismiss, 7000);
    return () => clearTimeout(timer);
    // Re-arm whenever a new action arrives (its key changes).
  }, [action.key, onDismiss]);

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 24,
        transform: "translateX(-50%)",
        zIndex: 320,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        background: "var(--surface-card)",
        border: "1px solid var(--hairline-strong)",
        borderRadius: "var(--radius-md)",
        boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
        maxWidth: "min(90vw, 460px)",
      }}
    >
      <span style={{ fontSize: 14, color: "var(--text-high)" }}>{action.message}</span>
      <button
        type="button"
        className="btn-secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await action.run();
          } finally {
            onDismiss();
          }
        }}
        style={{ padding: "0 12px", marginLeft: "auto" }}
      >
        <RotateCcw size={14} /> Undo
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{ background: "transparent", border: "none", color: "var(--text-med)", cursor: "pointer", display: "flex" }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
