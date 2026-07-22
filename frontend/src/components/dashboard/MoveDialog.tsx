"use client";

/**
 * Destination picker for moving items.
 *
 * Browses folders independently of the main view so the user can walk to
 * a target without losing their place. Folders being moved are hidden
 * from the list — the API rejects moving a folder into itself, and
 * offering it as a destination only invites the error.
 */

import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, Folder as FolderIcon, Loader2 } from "lucide-react";

import { Item, files as filesApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";

interface Crumb {
  id: string | null;
  name: string;
}

const ROOT: Crumb = { id: null, name: "My Cloud" };

export function MoveDialog({
  items,
  onCancel,
  onMove,
}: {
  items: Item[];
  onCancel: () => void;
  onMove: (parentId: string | null) => void;
}) {
  const { token } = useAuth();
  const [trail, setTrail] = useState<Crumb[]>([ROOT]);
  // Tagged with the folder it describes, so "loading" is derived rather
  // than set synchronously inside the effect.
  const [loaded, setLoaded] = useState<{ parentId: string | null; folders: Item[] } | null>(
    null
  );

  const current = trail[trail.length - 1];
  const movingIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  // Already-there is a no-op, so the confirm button is disabled for it.
  const sameFolder = items.every((i) => (i.parent_id ?? null) === current.id);

  const loading = loaded?.parentId !== current.id;
  const folders = loading ? [] : loaded?.folders ?? [];

  useEffect(() => {
    if (!token) return;
    let active = true;
    const parentId = current.id;
    filesApi
      .list(token, parentId, { limit: 200, sort: "name" })
      .then((page) => {
        if (!active) return;
        setLoaded({
          parentId,
          // A folder being moved cannot be its own destination, and
          // offering it only invites the error the API would return.
          folders: page.items.filter((i) => i.type === "folder" && !movingIds.has(i.id)),
        });
      })
      .catch(() => active && setLoaded({ parentId, folders: [] }));
    return () => {
      active = false;
    };
  }, [token, current.id, movingIds]);

  return (
    <Modal open={true} title={`Move ${items.length === 1 ? `“${items[0].name}”` : `${items.length} items`}`} onClose={onCancel} width={520}>
      <nav
        aria-label="Destination path"
        style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2, marginBottom: 12 }}
      >
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1;
          return (
            <React.Fragment key={`${crumb.id ?? "root"}-${index}`}>
              {index > 0 && <ChevronRight size={14} color="var(--text-low)" />}
              <button
                type="button"
                onClick={() => setTrail((t) => t.slice(0, index + 1))}
                disabled={last}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "2px 4px",
                  fontSize: 14,
                  cursor: last ? "default" : "pointer",
                  color: last ? "var(--text-high)" : "var(--text-med)",
                  fontWeight: last ? 600 : 500,
                  font: "inherit",
                }}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      <div
        style={{
          height: 240,
          overflowY: "auto",
          border: "1px solid var(--hairline)",
          borderRadius: "var(--radius-md)",
          background: "var(--canvas)",
        }}
      >
        {loading ? (
          <div style={{ padding: 20, display: "flex", gap: 8, alignItems: "center", color: "var(--text-med)" }}>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Loading…
          </div>
        ) : folders.length === 0 ? (
          <p style={{ padding: 20, color: "var(--text-med)", fontSize: 14 }}>
            No subfolders here. You can still move into this folder.
          </p>
        ) : (
          folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => setTrail((t) => [...t, { id: folder.id, name: folder.name }])}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "10px 14px",
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--hairline)",
                color: "var(--text-high)",
                fontSize: 14,
                cursor: "pointer",
                font: "inherit",
                textAlign: "left",
              }}
            >
              <FolderIcon size={16} color="var(--primary)" />
              <span style={{ flex: 1 }}>{folder.name}</span>
              <ChevronRight size={15} color="var(--text-low)" />
            </button>
          ))
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 18 }}>
        <span style={{ fontSize: 13, color: "var(--text-med)" }}>
          Destination: <strong style={{ color: "var(--text-high)" }}>{current.name}</strong>
        </span>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onMove(current.id)}
            disabled={sameFolder}
            title={sameFolder ? "Items are already in this folder" : undefined}
          >
            Move here
          </button>
        </div>
      </div>
    </Modal>
  );
}
