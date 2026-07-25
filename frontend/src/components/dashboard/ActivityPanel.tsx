"use client";

/**
 * A rolling feed of recent things that happened to the user's files.
 * TTL-bounded server-side, so it's "recent history" rather than a full
 * audit log. Each action slug maps to an icon + human phrasing here.
 */

import { useEffect, useState } from "react";
import {
  History,
  FolderInput,
  Pencil,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { Activity, files as filesApi } from "@/lib/api";
import { formatRelativeDate } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

function describe(entry: Activity): { icon: React.ReactNode; text: string } {
  const name = entry.item_name ?? "an item";
  switch (entry.action) {
    case "uploaded":
      return { icon: <Upload size={16} />, text: `Uploaded ${name}` };
    case "renamed":
      return {
        icon: <Pencil size={16} />,
        text: entry.detail ? `Renamed ${name} to ${entry.detail}` : `Renamed ${name}`,
      };
    case "moved":
      return { icon: <FolderInput size={16} />, text: `Moved ${entry.detail ?? name}` };
    case "trashed":
      return { icon: <Trash2 size={16} />, text: `Moved ${name} to Trash` };
    case "restored":
      return { icon: <RotateCcw size={16} />, text: `Restored ${entry.detail ?? name}` };
    case "deleted":
      return { icon: <Trash2 size={16} />, text: `Permanently deleted ${name}` };
    case "edited":
      return { icon: <Pencil size={16} />, text: `Edited ${name}` };
    case "new_version":
      return { icon: <History size={16} />, text: `Uploaded a new version of ${name}` };
    case "restored_version":
      return {
        icon: <History size={16} />,
        text: `Restored ${entry.detail ?? "a version"} of ${name}`,
      };
    default:
      return { icon: <History size={16} />, text: `${entry.action} ${name}` };
  }
}

export function ActivityPanel({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const [activity, setActivity] = useState<Activity[] | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    filesApi
      .activity(token)
      .then(({ activity: a }) => active && setActivity(a))
      .catch(() => active && setActivity([]));
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Activity"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--canvas)",
        zIndex: 260,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <p style={{ fontWeight: 600 }}>Activity</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="btn-secondary"
          style={{ padding: "0 12px" }}
        >
          <X size={18} />
        </button>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px clamp(16px, 4vw, 40px)", maxWidth: 720, width: "100%", margin: "0 auto" }}>
        {activity === null ? (
          <p style={{ color: "var(--text-med)" }}>Loading…</p>
        ) : activity.length === 0 ? (
          <p style={{ color: "var(--text-med)" }}>
            Nothing yet. Uploads, renames, moves, and deletions from the last 90 days will
            appear here.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {activity.map((entry) => {
              const { icon, text } = describe(entry);
              return (
                <div
                  key={entry.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 8px",
                    borderBottom: "1px solid var(--hairline)",
                  }}
                >
                  <span style={{ color: "var(--text-med)", flexShrink: 0, display: "flex" }}>
                    {icon}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {text}
                  </span>
                  <span style={{ color: "var(--text-low)", fontSize: 13, flexShrink: 0 }}>
                    {formatRelativeDate(entry.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
