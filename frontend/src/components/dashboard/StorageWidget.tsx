"use client";

import React from "react";

import { UsageDetail } from "@/lib/api";
import { estimatedMonthlyCostInr, formatBytes, formatInr } from "@/lib/format";

/**
 * S3 has no quota, so there is no honest denominator for a progress bar.
 * The bar is drawn against the ~90GB the project's cost model is built
 * around (requirements.md §3) and labelled as a budget reference, not a
 * storage limit — exceeding it costs more, it does not stop working.
 */
const BUDGET_REFERENCE_BYTES = 90 * 1024 ** 3;

const CATEGORY_LABELS: Record<string, string> = {
  images: "Photos",
  video: "Video",
  audio: "Audio",
  documents: "Documents",
  other: "Other",
};

export function StorageWidget({ usage }: { usage: UsageDetail | null }) {
  const stored = usage?.bytes_stored ?? 0;
  const pct = Math.min(100, (stored / BUDGET_REFERENCE_BYTES) * 100);
  const cost = estimatedMonthlyCostInr(stored + (usage?.trashed_bytes ?? 0));

  const top = (usage?.by_category ?? []).filter((c) => c.bytes_stored > 0).slice(0, 3);

  return (
    <div
      className="card"
      style={{ padding: 16, marginTop: "auto", background: "var(--surface-elevated)" }}
    >
      <h3 style={{ fontSize: 13, marginBottom: 10, color: "var(--text-high)" }}>Storage</h3>

      <div
        style={{
          background: "var(--hairline-strong)",
          height: 5,
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "var(--primary)",
            width: `${Math.max(pct, stored > 0 ? 2 : 0)}%`,
            height: "100%",
            transition: "width 300ms ease",
          }}
        />
      </div>

      <p style={{ fontSize: 12, marginTop: 8, color: "var(--text-body)" }}>
        {usage ? (
          <>
            {formatBytes(stored)} · {usage.file_count}{" "}
            {usage.file_count === 1 ? "file" : "files"}
          </>
        ) : (
          "Loading…"
        )}
      </p>

      {top.length > 0 && (
        <ul style={{ listStyle: "none", margin: "10px 0 0", fontSize: 11.5 }}>
          {top.map((c) => (
            <li
              key={c.category}
              style={{
                display: "flex",
                justifyContent: "space-between",
                color: "var(--text-med)",
                padding: "2px 0",
              }}
            >
              <span>{CATEGORY_LABELS[c.category] ?? c.category}</span>
              <span>{formatBytes(c.bytes_stored)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Trash still occupies the bucket until the purge runs, so it is
          surfaced rather than quietly excluded from the total. */}
      {usage && usage.trashed_count > 0 && (
        <p style={{ fontSize: 11.5, marginTop: 8, color: "var(--text-low)" }}>
          Trash holds {formatBytes(usage.trashed_bytes)} until it is purged.
        </p>
      )}

      <p style={{ fontSize: 11, marginTop: 8, color: "var(--text-low)" }}>
        ≈ {formatInr(cost)}/month in S3
      </p>
    </div>
  );
}
