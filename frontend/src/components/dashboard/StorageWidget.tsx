"use client";

import Link from "next/link";
import { Settings as SettingsIcon } from "lucide-react";

import { UsageDetail } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatBytes } from "@/lib/format";

const CATEGORY_LABELS: Record<string, string> = {
  images: "Photos",
  video: "Video",
  audio: "Audio",
  documents: "Documents",
  other: "Other",
};

export function StorageWidget({ usage }: { usage: UsageDetail | null }) {
  const { user } = useAuth();
  const stored = usage?.bytes_stored ?? 0;
  // The denominator is the user's own display preference (Settings ->
  // Storage), not a real cap — S3 bills by actual usage regardless of
  // this number. Falls back to the server-side default until the
  // profile has loaded.
  const quota = user?.storage_quota_bytes ?? 100 * 1024 ** 3;
  const pct = Math.min(100, (stored / quota) * 100);

  const top = (usage?.by_category ?? []).filter((c) => c.bytes_stored > 0).slice(0, 3);

  return (
    <div
      className="card"
      style={{ padding: 16, marginTop: "auto", background: "var(--surface-elevated)" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h3 style={{ fontSize: 13, color: "var(--text-high)" }}>Storage</h3>
        <Link
          href="/dashboard/settings"
          aria-label="Storage settings"
          style={{ color: "var(--text-low)", display: "flex" }}
        >
          <SettingsIcon size={14} />
        </Link>
      </div>

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
            background: pct >= 95 ? "var(--error)" : "var(--primary)",
            width: `${Math.max(pct, stored > 0 ? 2 : 0)}%`,
            height: "100%",
            transition: "width 300ms ease",
          }}
        />
      </div>

      <p style={{ fontSize: 12, marginTop: 8, color: "var(--text-body)" }}>
        {usage ? (
          <>
            {formatBytes(stored)} of {formatBytes(quota)} used
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
    </div>
  );
}
