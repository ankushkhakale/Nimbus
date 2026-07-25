"use client";

/**
 * Structured filters layered on top of the existing substring search,
 * plus saved searches. Size and date are offered as presets rather than
 * raw min/max inputs — far fewer clicks for the cases people actually
 * want, at the cost of not supporting an arbitrary custom range.
 */

import { useEffect, useRef, useState } from "react";
import { Bookmark, SlidersHorizontal, X } from "lucide-react";

import { ItemType } from "@/lib/api";
import {
  SavedSearch,
  addSavedSearch,
  getSavedSearches,
  removeSavedSearch,
} from "@/lib/preferences";
import { SearchFilters } from "@/lib/use-files";

const SIZE_PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: "Any size" },
  { label: "Under 1 MB", max: 1024 ** 2 },
  { label: "1–100 MB", min: 1024 ** 2, max: 100 * 1024 ** 2 },
  { label: "Over 100 MB", min: 100 * 1024 ** 2 },
];

const DATE_PRESETS: { label: string; days?: number }[] = [
  { label: "Any time" },
  { label: "Today", days: 1 },
  { label: "This week", days: 7 },
  { label: "This month", days: 30 },
  { label: "This year", days: 365 },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "Any category" },
  { value: "images", label: "Photos" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "documents", label: "Documents" },
  { value: "other", label: "Other" },
];

function sizePresetIndex(filters: SearchFilters): number {
  return SIZE_PRESETS.findIndex((p) => p.min === filters.min_size && p.max === filters.max_size);
}

function datePresetIndex(filters: SearchFilters): number {
  if (!filters.updated_after) return 0;
  const days = Math.round(
    (Date.now() - new Date(filters.updated_after).getTime()) / (1000 * 60 * 60 * 24)
  );
  const match = DATE_PRESETS.findIndex((p) => p.days === days);
  return match === -1 ? 0 : match;
}

export function SearchFilterPanel({
  query,
  filters,
  onChange,
  onApplySaved,
}: {
  query: string;
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  onApplySaved: (search: SavedSearch) => void;
}) {
  const [open, setOpen] = useState(false);
  // Read once on mount; kept in sync thereafter by the save/delete handlers
  // below rather than re-reading from storage on every open.
  const [saved, setSaved] = useState<SavedSearch[]>(() => getSavedSearches());
  const [labelDraft, setLabelDraft] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const hasActiveFilters = Object.keys(filters).length > 0;

  const handleSave = () => {
    if (!labelDraft?.trim()) return;
    addSavedSearch({ label: labelDraft.trim(), query, filters });
    setSaved(getSavedSearches());
    setLabelDraft(null);
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "flex" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Search filters"
        aria-expanded={open}
        className="btn-secondary"
        style={{
          padding: "0 10px",
          position: "relative",
          borderColor: hasActiveFilters ? "var(--primary)" : undefined,
        }}
      >
        <SlidersHorizontal size={15} />
        {hasActiveFilters && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--primary)",
            }}
          />
        )}
      </button>

      {open && (
        <div
          className="card"
          role="dialog"
          aria-label="Search filters"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            width: 280,
            padding: 16,
            zIndex: 60,
          }}
        >
          <div className="form-group">
            <label className="form-label">Type</label>
            <select
              className="form-input"
              value={filters.type ?? ""}
              onChange={(e) =>
                onChange({ ...filters, type: (e.target.value || undefined) as ItemType | undefined })
              }
            >
              <option value="">Any type</option>
              <option value="file">Files</option>
              <option value="folder">Folders</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Category</label>
            <select
              className="form-input"
              value={filters.category ?? ""}
              onChange={(e) => onChange({ ...filters, category: e.target.value || undefined })}
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Size</label>
            <select
              className="form-input"
              value={sizePresetIndex(filters)}
              onChange={(e) => {
                const preset = SIZE_PRESETS[Number(e.target.value)];
                onChange({ ...filters, min_size: preset.min, max_size: preset.max });
              }}
            >
              {SIZE_PRESETS.map((p, i) => (
                <option key={p.label} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 8 }}>
            <label className="form-label">Modified</label>
            <select
              className="form-input"
              value={datePresetIndex(filters)}
              onChange={(e) => {
                const preset = DATE_PRESETS[Number(e.target.value)];
                onChange({
                  ...filters,
                  updated_after: preset.days
                    ? new Date(Date.now() - preset.days * 86_400_000).toISOString()
                    : undefined,
                });
              }}
            >
              {DATE_PRESETS.map((p, i) => (
                <option key={p.label} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="btn-secondary"
              style={{ width: "100%", marginBottom: 12 }}
              onClick={() => onChange({})}
            >
              Clear filters
            </button>
          )}

          {query.trim() && (
            <div style={{ borderTop: "1px solid var(--hairline)", paddingTop: 12 }}>
              {labelDraft === null ? (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: "100%" }}
                  onClick={() => setLabelDraft("")}
                >
                  <Bookmark size={14} /> Save this search
                </button>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    autoFocus
                    className="form-input"
                    placeholder="Name this search"
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  />
                  <button type="button" className="btn-primary" onClick={handleSave}>
                    Save
                  </button>
                </div>
              )}
            </div>
          )}

          {saved.length > 0 && (
            <div style={{ borderTop: "1px solid var(--hairline)", marginTop: 12, paddingTop: 12 }}>
              <p style={{ fontSize: 12, color: "var(--text-med)", marginBottom: 8 }}>
                Saved searches
              </p>
              {saved.map((s) => (
                <div
                  key={s.id}
                  style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onApplySaved(s);
                      setOpen(false);
                    }}
                    style={{
                      flex: 1,
                      textAlign: "left",
                      background: "transparent",
                      border: "none",
                      color: "var(--text-high)",
                      fontSize: 13,
                      padding: "6px 8px",
                      borderRadius: 6,
                      cursor: "pointer",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.label}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete saved search "${s.label}"`}
                    onClick={() => {
                      removeSavedSearch(s.id);
                      setSaved(getSavedSearches());
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-low)",
                      cursor: "pointer",
                      display: "flex",
                      padding: 4,
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
