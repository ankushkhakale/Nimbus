"use client";

/**
 * Public share viewer — no login required, unless the share is
 * restricted to specific recipients (see ShareService.resolve on the
 * backend), in which case the visitor must be signed into the matching
 * account before this page can resolve anything beyond "not found".
 *
 * Static export has no dynamic route segments, so the token travels as
 * a query param (`?token=...`) rather than a path segment — the same
 * trick /auth/callback uses for the OAuth code.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Download,
  File as FileIcon,
  Folder as FolderIcon,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";

import { Item, shares as sharesApi } from "@/lib/api";
import { formatBytes, isImage, isVideo } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

interface Crumb {
  id: string;
  name: string;
}

export default function SharePage() {
  const [token] = useState(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("token")
  );
  const { token: viewerToken, isRestoring } = useAuth();

  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "file"; item: Item; ownerName: string }
    | { kind: "folder"; root: Item; ownerName: string; path: Crumb[]; items: Item[] }
  >({ kind: "loading" });
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);

  const loadRoot = useCallback(() => {
    if (!token) return;
    sharesApi
      .open(token, viewerToken)
      .then((res) => {
        if (res.item.type === "folder") {
          setState({
            kind: "folder",
            root: res.item,
            ownerName: res.owner_name,
            path: [{ id: res.item.id, name: res.item.name }],
            items: res.children,
          });
        } else {
          setState({ kind: "file", item: res.item, ownerName: res.owner_name });
        }
      })
      .catch(() => setState({ kind: "error" }));
  }, [token, viewerToken]);

  useEffect(() => {
    // Wait for the auth-restore attempt to settle so a restricted share
    // doesn't briefly 404 for a logged-in visitor mid-refresh.
    if (isRestoring) return;
    loadRoot();
  }, [isRestoring, loadRoot]);

  const openFolder = (item: Item) => {
    if (state.kind !== "folder" || !token) return;
    sharesApi
      .browse(token, item.id, viewerToken)
      .then((page) => {
        setState((prev) =>
          prev.kind === "folder"
            ? { ...prev, path: [...prev.path, { id: item.id, name: item.name }], items: page.items }
            : prev
        );
      })
      .catch(() => setState({ kind: "error" }));
  };

  const goToCrumb = (index: number) => {
    if (state.kind !== "folder" || !token) return;
    const crumb = state.path[index];
    const fetcher =
      index === 0 ? sharesApi.open(token, viewerToken).then((r) => ({ items: r.children })) : sharesApi.browse(token, crumb.id, viewerToken);
    fetcher
      .then((res) => {
        setState((prev) =>
          prev.kind === "folder" ? { ...prev, path: prev.path.slice(0, index + 1), items: res.items } : prev
        );
      })
      .catch(() => setState({ kind: "error" }));
  };

  const openFile = (item: Item) => {
    if (!token) return;
    sharesApi
      .downloadUrl(token, item.id, viewerToken)
      .then((r) => setPreview({ id: item.id, url: r.download_url }))
      .catch(() => {});
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--canvas)", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <Link href="/" style={{ fontWeight: 700, fontSize: 18, color: "var(--text-high)" }}>
          Nimbus
        </Link>
        <Link href="/dashboard" className="btn-secondary">
          Go to my Nimbus
        </Link>
      </header>

      <main style={{ flex: 1, padding: "40px clamp(16px, 5vw, 60px)", maxWidth: 900, margin: "0 auto", width: "100%" }}>
        {!token ? (
          <p style={{ color: "var(--text-med)" }}>This link is missing its token.</p>
        ) : state.kind === "loading" ? (
          <p style={{ color: "var(--text-med)", display: "flex", alignItems: "center", gap: 8 }}>
            <Loader2 size={16} className="spin" /> Loading…
          </p>
        ) : state.kind === "error" ? (
          <div>
            <p style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
              This link isn&apos;t available.
            </p>
            <p style={{ color: "var(--text-med)" }}>
              It may have expired, been revoked, or be restricted to specific people. If you
              believe you should have access, make sure you&apos;re signed into the right
              account.
            </p>
          </div>
        ) : state.kind === "file" ? (
          <FileView item={state.item} ownerName={state.ownerName} token={token} viewerToken={viewerToken} />
        ) : (
          <>
            <p style={{ color: "var(--text-med)", marginBottom: 4 }}>
              Shared by {state.ownerName}
            </p>
            <nav style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20, fontSize: 14 }}>
              {state.path.map((crumb, i) => (
                <span key={crumb.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {i > 0 && <span style={{ color: "var(--text-low)" }}>/</span>}
                  <button
                    type="button"
                    onClick={() => goToCrumb(i)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: i === state.path.length - 1 ? "var(--text-high)" : "var(--primary)",
                      cursor: i === state.path.length - 1 ? "default" : "pointer",
                      fontWeight: i === state.path.length - 1 ? 600 : 400,
                      padding: 0,
                    }}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </nav>

            {state.items.length === 0 ? (
              <p style={{ color: "var(--text-med)" }}>This folder is empty.</p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                  gap: 12,
                }}
              >
                {state.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="card"
                    onClick={() => (item.type === "folder" ? openFolder(item) : openFile(item))}
                    style={{
                      padding: 14,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    {item.type === "folder" ? (
                      <FolderIcon size={28} color="var(--primary)" />
                    ) : isImage(item.content_type) || isVideo(item.content_type) ? (
                      <ImageIcon size={28} color="var(--text-med)" />
                    ) : (
                      <FileIcon size={28} color="var(--text-med)" />
                    )}
                    <span
                      style={{
                        fontSize: 13,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        width: "100%",
                      }}
                    >
                      {item.name}
                    </span>
                    {item.size !== null && (
                      <span style={{ fontSize: 11, color: "var(--text-low)" }}>
                        {formatBytes(item.size)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPreview(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 300,
            padding: 20,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.url}
            alt=""
            style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: 8 }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function FileView({
  item,
  ownerName,
  token,
  viewerToken,
}: {
  item: Item;
  ownerName: string;
  token: string;
  viewerToken: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    sharesApi
      .downloadUrl(token, item.id, viewerToken)
      .then((r) => active && setUrl(r.download_url))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token, item.id, viewerToken]);

  return (
    <div style={{ textAlign: "center" }}>
      <p style={{ color: "var(--text-med)", marginBottom: 20 }}>Shared by {ownerName}</p>
      {isImage(item.content_type) && url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={item.name}
          style={{ maxWidth: "100%", maxHeight: "60vh", borderRadius: 8, marginBottom: 20 }}
        />
      )}
      <p style={{ fontSize: 17, fontWeight: 600 }}>{item.name}</p>
      <p style={{ color: "var(--text-med)", marginBottom: 20 }}>{formatBytes(item.size)}</p>
      <a
        href={url ?? undefined}
        className="btn-primary"
        style={{ display: "inline-flex", pointerEvents: url ? "auto" : "none", opacity: url ? 1 : 0.6 }}
      >
        <Download size={16} /> Download
      </a>
    </div>
  );
}
