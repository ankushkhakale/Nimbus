"use client";

/**
 * Items other Nimbus users have shared with this account's email. Each
 * entry opens the same public share viewer (/share/?token=...) rather
 * than the authenticated Lightbox — this account isn't the owner, so
 * the owner-scoped preview/thumbnail endpoints would 404 for it.
 */

import { useEffect, useState } from "react";
import { File as FileIcon, Folder as FolderIcon, X } from "lucide-react";

import { ReceivedShare, shares as sharesApi } from "@/lib/api";
import { formatBytes, formatRelativeDate } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

export function SharedWithMePanel({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const [received, setReceived] = useState<ReceivedShare[] | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    sharesApi
      .listReceived(token)
      .then(({ shares: all }) => active && setReceived(all))
      .catch(() => active && setReceived([]));
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Shared with me"
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
        <p style={{ fontWeight: 600 }}>Shared with me</p>
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

      <div style={{ flex: 1, overflowY: "auto", padding: "20px clamp(16px, 4vw, 40px)" }}>
        {received === null ? (
          <p style={{ color: "var(--text-med)" }}>Loading…</p>
        ) : received.length === 0 ? (
          <p style={{ color: "var(--text-med)" }}>
            Nothing has been shared with you yet. Items shared to this account&apos;s email
            address will show up here.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {received.map((share) => (
              <a
                key={share.id}
                href={`/share/?token=${share.token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="card animate-hover"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                {share.item.type === "folder" ? (
                  <FolderIcon size={18} color="var(--primary)" style={{ flexShrink: 0 }} />
                ) : (
                  <FileIcon size={18} color="var(--text-med)" style={{ flexShrink: 0 }} />
                )}
                <span style={{ flex: 2, minWidth: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {share.item.name}
                </span>
                <span style={{ flex: 1, color: "var(--text-med)", fontSize: 13 }}>
                  Shared by {share.owner_email}
                </span>
                <span style={{ color: "var(--text-low)", fontSize: 13 }}>
                  {share.item.size !== null ? formatBytes(share.item.size) : "—"}
                </span>
                <span style={{ color: "var(--text-low)", fontSize: 13 }}>
                  {formatRelativeDate(share.created_at)}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
