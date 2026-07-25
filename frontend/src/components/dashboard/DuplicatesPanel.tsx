"use client";

/**
 * Review UI for opportunistic duplicate/photo-stack detection (see
 * thumbnailer/app.py and file_service.py's clustering). Read-only until
 * the user explicitly picks what to keep — nothing is trashed silently.
 */

import { useEffect, useState } from "react";
import { CheckCircle2, ImageOff, Trash2, X } from "lucide-react";

import { Item, files as filesApi } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

type Mode = "duplicates" | "stacks";

export function DuplicatesPanel({
  onClose,
  onTrash,
}: {
  onClose: () => void;
  onTrash: (itemIds: string[]) => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>("duplicates");

  return (
    <DuplicatesPanelBody
      key={mode}
      mode={mode}
      setMode={setMode}
      onClose={onClose}
      onTrash={onTrash}
    />
  );
}

function DuplicatesPanelBody({
  mode,
  setMode,
  onClose,
  onTrash,
}: {
  mode: Mode;
  setMode: (mode: Mode) => void;
  onClose: () => void;
  onTrash: (itemIds: string[]) => Promise<void>;
}) {
  const { token } = useAuth();
  const [groups, setGroups] = useState<Item[][] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [keep, setKeep] = useState<Record<string, string>>({}); // groupKey -> itemId to keep
  const [busy, setBusy] = useState<string | null>(null); // groupKey being trashed

  useEffect(() => {
    if (!token) return;
    let active = true;
    const fetcher = mode === "duplicates" ? filesApi.duplicates : filesApi.photoStacks;
    fetcher(token)
      .then(({ groups: found }) => {
        if (!active) return;
        const items = found.map((g) => g.items);
        setGroups(items);
        const allIds = items.flat().map((i) => i.id);
        if (allIds.length > 0) {
          filesApi
            .thumbnailUrls(token, allIds)
            .then(({ urls: signed }) => {
              if (active) {
                setUrls(Object.fromEntries(signed.map((s) => [s.item_id, s.url])));
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => active && setGroups([]));
    return () => {
      active = false;
    };
  }, [token, mode]);

  const handleTrashGroup = async (groupKey: string, items: Item[]) => {
    const keepId = keep[groupKey] ?? items[0]?.id;
    const toTrash = items.filter((i) => i.id !== keepId).map((i) => i.id);
    if (toTrash.length === 0) return;
    setBusy(groupKey);
    try {
      await onTrash(toTrash);
      setGroups((prev) => (prev ? prev.filter((g) => g !== items) : prev));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Duplicates and photo stacks"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
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
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setMode("duplicates")}
            className={mode === "duplicates" ? "btn-primary" : "btn-secondary"}
          >
            Duplicates
          </button>
          <button
            type="button"
            onClick={() => setMode("stacks")}
            className={mode === "stacks" ? "btn-primary" : "btn-secondary"}
          >
            Photo stacks
          </button>
        </div>
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
        {groups === null ? (
          <p style={{ color: "var(--text-med)" }}>Scanning your photos…</p>
        ) : groups.length === 0 ? (
          <p style={{ color: "var(--text-med)" }}>
            {mode === "duplicates"
              ? "No near-identical photos found."
              : "No photo bursts found."}
          </p>
        ) : (
          groups.map((items, gi) => {
            const groupKey = items.map((i) => i.id).join(",");
            const keepId = keep[groupKey] ?? items[0]?.id;
            return (
              <div key={groupKey} className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <p style={{ fontSize: 13, color: "var(--text-med)" }}>
                    Group {gi + 1} · {items.length} photos — pick one to keep
                  </p>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ color: "var(--error)" }}
                    disabled={busy === groupKey}
                    onClick={() => void handleTrashGroup(groupKey, items)}
                  >
                    <Trash2 size={15} />
                    {busy === groupKey ? "Trashing…" : `Trash the other ${items.length - 1}`}
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                    gap: 10,
                  }}
                >
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setKeep((prev) => ({ ...prev, [groupKey]: item.id }))}
                      title={item.name}
                      style={{
                        position: "relative",
                        aspectRatio: "1 / 1",
                        borderRadius: "var(--radius-md)",
                        overflow: "hidden",
                        border:
                          keepId === item.id
                            ? "2px solid var(--primary)"
                            : "1px solid var(--hairline-strong)",
                        padding: 0,
                        cursor: "pointer",
                        background: "var(--surface-elevated)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {urls[item.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={urls[item.id]}
                          alt={item.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <ImageOff size={18} color="var(--text-low)" />
                      )}
                      {keepId === item.id && (
                        <span
                          style={{
                            position: "absolute",
                            top: 4,
                            right: 4,
                            background: "var(--primary)",
                            borderRadius: "50%",
                            display: "flex",
                          }}
                        >
                          <CheckCircle2 size={16} color="var(--on-primary)" />
                        </span>
                      )}
                      <span
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background: "rgba(0,0,0,0.6)",
                          color: "#fff",
                          fontSize: 10,
                          padding: "2px 4px",
                        }}
                      >
                        {formatBytes(item.size)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
