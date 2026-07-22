"use client";

/**
 * Modal primitives replacing window.prompt / window.confirm.
 *
 * Beyond looking native to the app, these fix real problems with the
 * browser dialogs: they block the whole tab, cannot be styled, cannot
 * show validation, and Firefox lets a user suppress them entirely —
 * after which rename and delete silently stop working.
 */

import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export function Modal({
  open,
  title,
  onClose,
  children,
  width = 440,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Stop the page behind from scrolling while the dialog is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        // Only a click that both starts and ends on the backdrop closes;
        // otherwise dragging to select text inside dismisses the dialog.
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 200,
      }}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: width, background: "var(--surface-card)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 20px",
            borderBottom: "1px solid var(--hairline)",
          }}
        >
          <h2 style={{ fontSize: 17, letterSpacing: "-0.01em" }}>{title}</h2>
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
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

/** Text prompt with the value preselected, as a rename dialog should be. */
/**
 * Mount this only while it should be visible — callers render it
 * conditionally. Keeping it mounted and toggling `open` would mean
 * resetting the field from an effect on every open, which cascades a
 * render each time.
 */
export function PromptModal({
  title,
  label,
  initialValue = "",
  confirmLabel = "Save",
  onCancel,
  onSubmit,
}: {
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Select the basename but not the extension, so renaming a file does
    // not mean retyping ".jpg" every time.
    const id = setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      const dot = initialValue.lastIndexOf(".");
      input.setSelectionRange(0, dot > 0 ? dot : initialValue.length);
    }, 20);
    return () => clearTimeout(id);
  }, [initialValue]);

  const trimmed = value.trim();
  const invalid =
    !trimmed || trimmed === "." || trimmed === ".." || /[/\\\x00]/.test(trimmed);

  return (
    <Modal open={true} title={title} onClose={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) onSubmit(trimmed);
        }}
      >
        <label className="form-label" htmlFor="prompt-value">{label}</label>
        <input
          id="prompt-value"
          ref={inputRef}
          className="form-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {trimmed && invalid && (
          <p style={{ marginTop: 8, fontSize: 13, color: "var(--error)" }}>
            Names cannot contain slashes, or be “.” or “..”.
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={invalid}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  destructive = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <div style={{ fontSize: 15, color: "var(--text-body)" }}>{body}</div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={destructive ? "btn-secondary" : "btn-primary"}
          onClick={onConfirm}
          style={
            destructive
              ? { background: "var(--error)", borderColor: "var(--error)", color: "#fff" }
              : undefined
          }
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
