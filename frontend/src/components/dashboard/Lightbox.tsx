"use client";

/**
 * Full-screen viewer for a file, with arrow-key paging through the
 * surrounding list.
 *
 * Images, PDFs, video and audio render inline from a preview URL (no
 * attachment disposition). Anything else gets a download prompt rather
 * than a broken embed — the browser would otherwise either download it
 * anyway or show a blank frame.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, X } from "lucide-react";

import { Item, files as filesApi } from "@/lib/api";
import { formatBytes, formatRelativeDate, isAudio, isImage, isVideo } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

function isPdf(item: Item): boolean {
  return item.content_type === "application/pdf";
}

export function Lightbox({
  items,
  index,
  onClose,
  onNavigate,
  onDownload,
}: {
  items: Item[];
  index: number;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
  onDownload: (item: Item) => void;
}) {
  const { token } = useAuth();
  // Tagged with the item it belongs to, so paging to the next photo shows
  // a loading state rather than briefly showing the previous image. The
  // alternative — resetting state at the top of the effect — triggers a
  // cascading render on every navigation.
  const [preview, setPreview] = useState<{ id: string; url: string | null } | null>(null);

  const item = items[index];
  const canPrev = index > 0;
  const canNext = index < items.length - 1;

  const isCurrent = preview?.id === item?.id;
  const url = isCurrent ? preview?.url ?? null : null;
  const failed = isCurrent && preview?.url === null;

  useEffect(() => {
    if (!token || !item) return;
    let active = true;
    filesApi
      .previewUrl(token, item.id)
      .then((r) => active && setPreview({ id: item.id, url: r.download_url }))
      .catch(() => active && setPreview({ id: item.id, url: null }));
    return () => {
      active = false;
    };
  }, [token, item]);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && canPrev) onNavigate(index - 1);
      if (e.key === "ArrowRight" && canNext) onNavigate(index + 1);
    },
    [onClose, onNavigate, index, canPrev, canNext]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previous;
    };
  }, [handleKey]);

  if (!item) return null;

  const renderable =
    isImage(item.content_type) ||
    isPdf(item) ||
    isVideo(item.content_type) ||
    isAudio(item.content_type);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.92)",
        zIndex: 300,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "14px 20px",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: "var(--text-high)",
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {item.name}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-med)" }}>
            {formatBytes(item.size)} · {formatRelativeDate(item.taken_at ?? item.updated_at)}
            {items.length > 1 && ` · ${index + 1} of ${items.length}`}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onDownload(item)}
            aria-label="Download"
            style={{ padding: "0 12px" }}
          >
            <Download size={16} />
            <span className="btn-label">Download</span>
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            aria-label="Close viewer"
            style={{ padding: "0 12px" }}
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <div
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          minHeight: 0,
        }}
      >
        {canPrev && (
          <NavButton side="left" onClick={() => onNavigate(index - 1)} />
        )}

        {!renderable || failed ? (
          <div style={{ textAlign: "center", color: "var(--text-med)" }}>
            <FileText size={40} color="var(--text-low)" />
            <p style={{ marginTop: 14, fontSize: 15 }}>
              {failed ? "This file could not be loaded." : "No preview for this file type."}
            </p>
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: 16 }}
              onClick={() => onDownload(item)}
            >
              <Download size={16} /> Download instead
            </button>
          </div>
        ) : !url ? (
          <p style={{ color: "var(--text-med)" }}>Loading…</p>
        ) : isPdf(item) ? (
          <iframe
            src={url}
            title={item.name}
            style={{ width: "100%", height: "100%", border: "none", borderRadius: 8 }}
          />
        ) : isVideo(item.content_type) ? (
          <video
            src={url}
            controls
            autoPlay
            onError={() => setPreview({ id: item.id, url: null })}
            style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }}
          />
        ) : isAudio(item.content_type) ? (
          <audio
            src={url}
            controls
            autoPlay
            onError={() => setPreview({ id: item.id, url: null })}
            style={{ width: "100%", maxWidth: 480 }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={item.name}
            onError={() => setPreview({ id: item.id, url: null })}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        )}

        {canNext && <NavButton side="right" onClick={() => onNavigate(index + 1)} />}
      </div>
    </div>
  );
}

function NavButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous" : "Next"}
      style={{
        position: "absolute",
        [side]: 16,
        top: "50%",
        transform: "translateY(-50%)",
        width: 44,
        height: 44,
        borderRadius: "50%",
        background: "var(--surface-card)",
        border: "1px solid var(--hairline-strong)",
        color: "var(--text-high)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      {side === "left" ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
    </button>
  );
}
