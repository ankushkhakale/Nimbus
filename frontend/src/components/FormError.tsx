"use client";

import React from "react";
import { AlertCircle } from "lucide-react";

/** Inline form error. Renders nothing when there is no message. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        marginBottom: "20px",
        padding: "12px 14px",
        borderRadius: "10px",
        background: "rgba(239, 68, 68, 0.12)",
        border: "1px solid rgba(239, 68, 68, 0.35)",
        color: "#fca5a5",
        fontSize: "14px",
        lineHeight: 1.45,
      }}
    >
      <AlertCircle size={17} style={{ flexShrink: 0, marginTop: "1px" }} />
      <span>{message}</span>
    </div>
  );
}
