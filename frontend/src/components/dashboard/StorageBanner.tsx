"use client";

/**
 * An in-app banner shown when the account nears its display quota. That
 * quota is cosmetic (S3 bills by actual usage, there's no hard cap — see
 * StorageWidget), so this is a nudge, not an enforcement: it points at
 * Trash and the quota setting rather than blocking anything. In-app only
 * — there's no mail provider to send an email from.
 */

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import Link from "next/link";

import { UsageDetail } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { dismissStorageBanner, isStorageBannerDismissed } from "@/lib/preferences";

const WARN = 0.9;
const CRITICAL = 0.98;
const DEFAULT_QUOTA = 100 * 1024 ** 3;

export function StorageBanner({
  usage,
  onOpenTrash,
}: {
  usage: UsageDetail | null;
  onOpenTrash: () => void;
}) {
  const { user } = useAuth();
  const quota = user?.storage_quota_bytes ?? DEFAULT_QUOTA;
  const stored = usage?.bytes_stored ?? 0;
  const fraction = quota > 0 ? stored / quota : 0;
  const level = fraction >= CRITICAL ? "critical" : fraction >= WARN ? "warning" : null;

  // Read the dismissed flag lazily so this component never touches
  // localStorage during the module's SSR pass.
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const isDismissed = level
    ? dismissed ?? isStorageBannerDismissed(level)
    : false;

  if (!level || isDismissed) return null;

  const critical = level === "critical";
  const pct = Math.round(fraction * 100);

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        marginBottom: 18,
        borderRadius: "var(--radius-md)",
        border: `1px solid ${critical ? "var(--error)" : "var(--hairline-strong)"}`,
        background: critical ? "rgba(248, 113, 113, 0.08)" : "var(--surface-elevated)",
      }}
    >
      <AlertTriangle
        size={18}
        color={critical ? "var(--error)" : "var(--text-med)"}
        style={{ flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
        <strong>{pct}% of your storage used</strong>{" "}
        <span style={{ color: "var(--text-med)" }}>
          ({formatBytes(stored)} of {formatBytes(quota)}).{" "}
          {critical
            ? "You're almost out of room — clear some space from Trash, or raise your storage amount in Settings."
            : "Consider clearing Trash or raising your storage amount in Settings."}
        </span>
      </div>
      <button type="button" className="btn-secondary" onClick={onOpenTrash} style={{ flexShrink: 0 }}>
        Open Trash
      </button>
      <Link href="/dashboard/settings?tab=storage" className="btn-secondary" style={{ flexShrink: 0 }}>
        Settings
      </Link>
      <button
        type="button"
        onClick={() => {
          dismissStorageBanner(level);
          setDismissed(true);
        }}
        aria-label="Dismiss"
        style={{ background: "transparent", border: "none", color: "var(--text-med)", cursor: "pointer", display: "flex", flexShrink: 0 }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
