"use client";

import React from "react";

import { Usage } from "@/lib/api";
import { estimatedMonthlyCostInr, formatBytes, formatInr } from "@/lib/format";

/**
 * S3 has no quota, so there is no honest denominator for a progress bar.
 * The bar is drawn against the ~90GB the project's cost model is built
 * around (requirements.md §3) and labelled as a budget reference, not a
 * storage limit — exceeding it costs more, it does not stop working.
 */
const BUDGET_REFERENCE_BYTES = 90 * 1024 ** 3;

export function StorageWidget({ usage }: { usage: Usage | null }) {
  const stored = usage?.bytes_stored ?? 0;
  const pct = Math.min(100, (stored / BUDGET_REFERENCE_BYTES) * 100);
  const cost = estimatedMonthlyCostInr(stored);

  return (
    <div
      className="glass-panel"
      style={{
        padding: "20px",
        borderRadius: "var(--radius-md)",
        marginTop: "auto",
        marginBottom: "24px",
      }}
    >
      <h3 style={{ fontSize: "14px", marginBottom: "8px", color: "var(--text-high)" }}>
        Storage
      </h3>

      <div
        style={{
          background: "rgba(255,255,255,0.1)",
          height: "6px",
          borderRadius: "4px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "var(--primary)",
            width: `${Math.max(pct, stored > 0 ? 2 : 0)}%`,
            height: "100%",
            boxShadow: "0 0 10px var(--primary)",
            transition: "width 300ms ease",
          }}
        />
      </div>

      <p style={{ fontSize: "12px", marginTop: "8px", color: "var(--text-med)" }}>
        {usage ? (
          <>
            {formatBytes(stored)} used · {usage.file_count}{" "}
            {usage.file_count === 1 ? "file" : "files"}
          </>
        ) : (
          "Loading…"
        )}
      </p>

      <p style={{ fontSize: "11px", marginTop: "4px", color: "var(--text-low)" }}>
        ≈ {formatInr(cost)}/month in S3
      </p>
    </div>
  );
}
