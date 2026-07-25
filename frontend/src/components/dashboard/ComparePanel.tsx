"use client";

/**
 * Two files, side by side. Each pane fetches and renders independently
 * of the other — there is no synchronized scrolling or diffing, just a
 * plain two-up view, which is enough for "does A look different from
 * B" without building a real diff engine.
 */

import { useEffect, useState } from "react";
import { Download, File as FileIcon, X } from "lucide-react";

import { Item, files as filesApi } from "@/lib/api";
import { formatBytes, isAudio, isDocx, isImage, isPdf, isVideo } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { DocxPreview } from "./DocxPreview";

export function ComparePanel({ items, onClose }: { items: [Item, Item]; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Compare files"
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
          padding: "14px 20px",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <p style={{ color: "var(--text-high)", fontWeight: 600 }}>Compare</p>
        <button
          type="button"
          className="btn-secondary"
          onClick={onClose}
          aria-label="Close"
          style={{ padding: "0 12px" }}
        >
          <X size={18} />
        </button>
      </header>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <ComparePane item={items[0]} />
        <div style={{ width: 1, background: "var(--hairline)" }} />
        <ComparePane item={items[1]} />
      </div>
    </div>
  );
}

function ComparePane({ item }: { item: Item }) {
  const { token } = useAuth();
  const [state, setState] = useState<{ id: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    filesApi
      .previewUrl(token, item.id)
      .then((r) => active && setState({ id: item.id, url: r.download_url }))
      .catch(() => active && setState({ id: item.id, url: null }));
    return () => {
      active = false;
    };
  }, [token, item.id]);

  const url = state?.id === item.id ? state.url : null;
  const failed = state?.id === item.id && state.url === null;
  const renderable =
    isImage(item.content_type) ||
    isPdf(item.content_type) ||
    isVideo(item.content_type) ||
    isAudio(item.content_type) ||
    isDocx(item.content_type);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--hairline)",
          fontSize: 13,
        }}
      >
        <p
          style={{
            fontWeight: 600,
            color: "var(--text-high)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.name}
        </p>
        <p style={{ color: "var(--text-med)" }}>{formatBytes(item.size)}</p>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          overflow: "auto",
        }}
      >
        {!renderable || failed ? (
          <div style={{ textAlign: "center", color: "var(--text-med)" }}>
            <FileIcon size={32} color="var(--text-low)" />
            <p style={{ marginTop: 10, fontSize: 13 }}>
              {failed ? "This file could not be loaded." : "No preview for this file type."}
            </p>
            {url && (
              <a href={url} download={item.name} className="btn-secondary" style={{ marginTop: 10, display: "inline-flex" }}>
                <Download size={14} /> Download
              </a>
            )}
          </div>
        ) : !url ? (
          <p style={{ color: "var(--text-med)" }}>Loading…</p>
        ) : isPdf(item.content_type) ? (
          <iframe
            src={url}
            title={item.name}
            style={{ width: "100%", height: "100%", border: "none", borderRadius: 8 }}
          />
        ) : isVideo(item.content_type) ? (
          <video src={url} controls style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
        ) : isAudio(item.content_type) ? (
          <audio src={url} controls style={{ width: "100%" }} />
        ) : isDocx(item.content_type) ? (
          <DocxPreview url={url} onError={() => setState({ id: item.id, url: null })} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={item.name}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }}
          />
        )}
      </div>
    </div>
  );
}
