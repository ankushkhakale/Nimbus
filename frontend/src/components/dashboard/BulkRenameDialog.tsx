"use client";

/**
 * Pattern-based bulk rename. The pattern supports {n} (a 1-based
 * sequence number) and {name} (the item's original name without
 * extension). A file's extension is preserved automatically, so the
 * user doesn't have to remember to include it. A live preview shows the
 * first few results before anything is applied.
 */

import { useMemo, useState } from "react";

import { Item } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";

function splitExt(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { stem: name, ext: "" };
  return { stem: name.slice(0, dot), ext: name.slice(dot) };
}

export function computeRenames(
  items: Item[],
  pattern: string
): { id: string; name: string }[] {
  return items.map((item, index) => {
    const { stem, ext } = splitExt(item.name);
    let base = pattern.replace(/\{n\}/g, String(index + 1)).replace(/\{name\}/g, stem);
    // Preserve the extension for files unless the pattern already ends
    // with it (so "{name}.txt" doesn't become "….txt.txt").
    if (item.type === "file" && ext && !base.toLowerCase().endsWith(ext.toLowerCase())) {
      base += ext;
    }
    return { id: item.id, name: base.trim() || item.name };
  });
}

export function BulkRenameDialog({
  items,
  onCancel,
  onApply,
}: {
  items: Item[];
  onCancel: () => void;
  onApply: (renames: { id: string; name: string }[]) => void;
}) {
  const [pattern, setPattern] = useState("{name}");
  const renames = useMemo(() => computeRenames(items, pattern), [items, pattern]);
  const valid = pattern.trim().length > 0;

  return (
    <Modal open title={`Rename ${items.length} items`} onClose={onCancel} width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ fontSize: 13, color: "var(--text-med)", display: "block", marginBottom: 6 }}>
            Naming pattern
          </label>
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="form-input"
            style={{ width: "100%" }}
            placeholder="e.g. Vacation {n}"
            autoFocus
          />
          <p style={{ fontSize: 12, color: "var(--text-low)", marginTop: 6 }}>
            <code>{"{n}"}</code> = number (1, 2, 3…), <code>{"{name}"}</code> = original name.
            File extensions are kept automatically.
          </p>
        </div>

        <div>
          <p style={{ fontSize: 13, color: "var(--text-med)", marginBottom: 6 }}>Preview</p>
          <div
            style={{
              maxHeight: 200,
              overflowY: "auto",
              border: "1px solid var(--hairline)",
              borderRadius: "var(--radius-md)",
              padding: "8px 12px",
              fontSize: 13,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {renames.slice(0, 20).map((r, i) => (
              <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span
                  style={{
                    color: "var(--text-low)",
                    textDecoration: "line-through",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                >
                  {items[i].name}
                </span>
                <span style={{ color: "var(--text-low)" }}>→</span>
                <span
                  style={{
                    color: "var(--text-high)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                >
                  {r.name}
                </span>
              </div>
            ))}
            {renames.length > 20 && (
              <p style={{ color: "var(--text-low)", fontSize: 12 }}>
                …and {renames.length - 20} more
              </p>
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!valid}
            onClick={() => onApply(renames)}
          >
            Rename {items.length}
          </button>
        </div>
      </div>
    </Modal>
  );
}
