"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Clock,
  Cloud,
  Download,
  File as FileIcon,
  FileText,
  FolderPlus,
  Folder as FolderIcon,
  Image as ImageIcon,
  Loader2,
  Music,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";

import { Item, SortKey } from "@/lib/api";
import { formatBytes, formatRelativeDate } from "@/lib/format";
import { View, useFiles } from "@/lib/use-files";
import { FormError } from "@/components/FormError";
import { UserMenu } from "@/components/UserMenu";
import { ConfirmModal, PromptModal } from "@/components/ui/Modal";
import { OverflowMenu } from "@/components/ui/OverflowMenu";
import { Lightbox } from "./Lightbox";
import { MoveDialog } from "./MoveDialog";
import { PhotoGrid } from "./PhotoGrid";
import { StorageWidget } from "./StorageWidget";

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name (A–Z)",
  name_desc: "Name (Z–A)",
  updated: "Newest first",
  updated_asc: "Oldest first",
  size: "Largest first",
  size_asc: "Smallest first",
};

const NAV: { key: View; label: string; icon: React.ReactNode }[] = [
  { key: "files", label: "My Cloud", icon: <FolderIcon size={16} /> },
  { key: "photos", label: "Photos", icon: <ImageIcon size={16} /> },
  { key: "videos", label: "Videos", icon: <Video size={16} /> },
  { key: "recent", label: "Recent", icon: <Clock size={16} /> },
  { key: "trash", label: "Trash", icon: <Trash2 size={16} /> },
];

function iconFor(item: Item) {
  const ct = item.content_type ?? "";
  if (item.type === "folder") return <FolderIcon size={18} color="var(--primary)" />;
  if (ct.startsWith("image/")) return <ImageIcon size={18} color="var(--text-med)" />;
  if (ct.startsWith("video/")) return <Video size={18} color="var(--text-med)" />;
  if (ct.startsWith("audio/")) return <Music size={18} color="var(--text-med)" />;
  if (/pdf|document|text/.test(ct)) return <FileText size={18} color="var(--text-med)" />;
  return <FileIcon size={18} color="var(--text-med)" />;
}

type DialogState =
  | { kind: "none" }
  | { kind: "newFolder" }
  | { kind: "rename"; item: Item }
  | { kind: "trash"; items: Item[] }
  | { kind: "deleteForever"; items: Item[] }
  | { kind: "move"; items: Item[] };

export function FileBrowser() {
  const b = useFiles();
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [dragging, setDragging] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const { items, loading, loadingMore, error, uploads, usage, view, selected } = b;

  const folders = useMemo(() => items.filter((i) => i.type === "folder"), [items]);
  const fileItems = useMemo(() => items.filter((i) => i.type === "file"), [items]);
  // Anything openable in the viewer, so arrow keys page through a
  // coherent set rather than skipping over folders.
  const viewable = useMemo(() => fileItems, [fileItems]);
  const lightboxIndex = lightboxId ? viewable.findIndex((i) => i.id === lightboxId) : -1;

  const guard = useCallback(async (fn: () => Promise<void>) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed.");
    }
  }, []);

  // --- infinite scroll ------------------------------------------------

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !b.hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && void b.loadMore(),
      // Start fetching before the sentinel is actually visible, so the
      // next page usually lands before the user reaches the bottom.
      { rootMargin: "400px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [b.hasMore, b.loadMore, b]);

  // --- keyboard shortcuts ---------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchInput.current?.focus();
        return;
      }
      if (typing || dialog.kind !== "none" || lightboxId) return;

      if ((e.key === "a" || e.key === "A") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        b.selectAll();
      }
      if (e.key === "Escape") b.clearSelection();
      if ((e.key === "Delete" || e.key === "Backspace") && b.selectedItems.length) {
        e.preventDefault();
        setDialog({
          kind: view === "trash" ? "deleteForever" : "trash",
          items: b.selectedItems,
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [b, dialog.kind, lightboxId, view]);

  // --- actions ---------------------------------------------------------

  const openItem = (item: Item) => {
    if (item.type === "folder") b.openFolder(item);
    else setLightboxId(item.id);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (view === "trash") return;
    if (e.dataTransfer.files.length) void guard(() => b.upload(e.dataTransfer.files));
  };

  const closeDialog = () => setDialog({ kind: "none" });

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar
        view={view}
        setView={(v) => {
          b.setView(v);
          setSidebarOpen(false);
        }}
        usage={usage}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main
        style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minWidth: 0 }}
        onDragOver={(e) => {
          e.preventDefault();
          if (view !== "trash") setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Toolbar
          browser={b}
          searchRef={searchInput}
          onNewFolder={() => setDialog({ kind: "newFolder" })}
          onUploadClick={() => fileInput.current?.click()}
          onOpenSidebar={() => setSidebarOpen(true)}
        />

        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void guard(() => b.upload(e.target.files!));
            e.target.value = "";
          }}
        />

        <div style={{ padding: "24px clamp(16px, 4vw, 40px)", width: "100%", maxWidth: 1600, margin: "0 auto" }}>
          {view === "files" && !b.query && <Breadcrumbs browser={b} />}

          <FormError message={actionError ?? error} />

          {uploads.length > 0 && (
            <UploadList uploads={uploads} onDismiss={b.dismissUpload} />
          )}

          {!loading && items.length > 0 && (
            <SelectionBar
              count={selected.size}
              total={items.length}
              view={view}
              onSelectAll={b.selectAll}
              onClear={b.clearSelection}
              onMove={() => setDialog({ kind: "move", items: b.selectedItems })}
              onTrash={() => setDialog({ kind: "trash", items: b.selectedItems })}
              onRestore={() => void guard(() => b.restoreItems([...selected]))}
              onDeleteForever={() =>
                setDialog({ kind: "deleteForever", items: b.selectedItems })
              }
            />
          )}

          {loading ? (
            <p style={{ color: "var(--text-med)" }}>Loading…</p>
          ) : items.length === 0 ? (
            <EmptyState view={view} query={b.query} />
          ) : view === "photos" ? (
            <PhotoGrid
              photos={items}
              selected={selected}
              onToggleSelect={b.toggleSelected}
              onOpen={(item) => setLightboxId(item.id)}
            />
          ) : (
            <>
              {folders.length > 0 && (
                <>
                  <h2 style={sectionHeading}>Folders</h2>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                      gap: 14,
                      marginBottom: 34,
                    }}
                  >
                    {folders.map((folder) => (
                      <FolderCard
                        key={folder.id}
                        item={folder}
                        isSelected={selected.has(folder.id)}
                        readOnly={view === "trash"}
                        onOpen={() => openItem(folder)}
                        onToggleSelect={b.toggleSelected}
                        onRename={() => setDialog({ kind: "rename", item: folder })}
                        onTrash={() => setDialog({ kind: "trash", items: [folder] })}
                      />
                    ))}
                  </div>
                </>
              )}

              {fileItems.length > 0 && (
                <>
                  <h2 style={sectionHeading}>Files</h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {fileItems.map((file) => (
                      <FileRow
                        key={file.id}
                        item={file}
                        isSelected={selected.has(file.id)}
                        readOnly={view === "trash"}
                        onOpen={() => openItem(file)}
                        onToggleSelect={b.toggleSelected}
                        onDownload={() => void guard(() => b.download(file))}
                        onRename={() => setDialog({ kind: "rename", item: file })}
                        onTrash={() => setDialog({ kind: "trash", items: [file] })}
                        onRestore={() => void guard(() => b.restoreItems([file.id]))}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* Watched by the observer; fetches the next page before the
              user actually reaches the bottom. */}
          <div ref={sentinel} style={{ height: 1 }} />
          {loadingMore && (
            <p style={{ padding: "20px 0", color: "var(--text-med)", fontSize: 14 }}>
              Loading more…
            </p>
          )}
          {!loading && b.total > 0 && (
            <p style={{ padding: "24px 0", color: "var(--text-low)", fontSize: 13 }}>
              Showing {items.length} of {b.total}
            </p>
          )}
        </div>
      </main>

      {dragging && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(250,255,105,0.10)",
            border: "2px dashed var(--primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            fontWeight: 600,
            pointerEvents: "none",
            zIndex: 100,
          }}
        >
          Drop files to upload
        </div>
      )}

      {/* --- dialogs --- */}

      {dialog.kind === "newFolder" && (
      <PromptModal
        title="New folder"
        label="Folder name"
        confirmLabel="Create"
        onCancel={closeDialog}
        onSubmit={(name) => {
          closeDialog();
          void guard(() => b.createFolder(name));
        }}
      />
      )}

      {dialog.kind === "rename" && (
      <PromptModal
        title="Rename"
        label="New name"
        initialValue={dialog.item.name}
        onCancel={closeDialog}
        onSubmit={(name) => {
          if (dialog.kind !== "rename") return;
          const item = dialog.item;
          closeDialog();
          void guard(() => b.rename(item, name));
        }}
      />
      )}

      <ConfirmModal
        open={dialog.kind === "trash"}
        title="Move to Trash"
        confirmLabel="Move to Trash"
        body={
          dialog.kind === "trash" ? (
            <>
              Move {describe(dialog.items)} to Trash?
              {dialog.items.some((i) => i.type === "folder") &&
                " Everything inside the selected folders goes too."}{" "}
              You can restore from Trash for 30 days.
            </>
          ) : null
        }
        onCancel={closeDialog}
        onConfirm={() => {
          if (dialog.kind !== "trash") return;
          const ids = dialog.items.map((i) => i.id);
          closeDialog();
          void guard(() => b.trashItems(ids));
        }}
      />

      <ConfirmModal
        open={dialog.kind === "deleteForever"}
        title="Delete permanently"
        confirmLabel="Delete forever"
        destructive
        body={
          dialog.kind === "deleteForever" ? (
            <>
              Permanently delete {describe(dialog.items)}? The files are removed from
              storage and <strong>this cannot be undone</strong>.
            </>
          ) : null
        }
        onCancel={closeDialog}
        onConfirm={() => {
          if (dialog.kind !== "deleteForever") return;
          const ids = dialog.items.map((i) => i.id);
          closeDialog();
          void guard(() => b.deleteForever(ids));
        }}
      />

      {dialog.kind === "move" && (
        <MoveDialog
          items={dialog.items}
          onCancel={closeDialog}
          onMove={(parentId) => {
            const ids = dialog.items.map((i) => i.id);
            closeDialog();
            void guard(() => b.moveTo(ids, parentId));
          }}
        />
      )}

      {lightboxIndex >= 0 && (
        <Lightbox
          items={viewable}
          index={lightboxIndex}
          onClose={() => setLightboxId(null)}
          onNavigate={(next) => setLightboxId(viewable[next]?.id ?? null)}
          onDownload={(item) => void guard(() => b.download(item))}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function describe(items: Item[]): string {
  return items.length === 1 ? `“${items[0].name}”` : `${items.length} items`;
}

const sectionHeading: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "var(--text-med)",
  marginBottom: 12,
};

function Sidebar({
  view,
  setView,
  usage,
  open,
  onClose,
}: {
  view: View;
  setView: (v: View) => void;
  usage: ReturnType<typeof useFiles>["usage"];
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop only exists on small screens, where the sidebar is a
          drawer rather than a column. */}
      {open && (
        <div
          onClick={onClose}
          className="sidebar-backdrop"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90 }}
        />
      )}
      <aside
        className={`dashboard-sidebar${open ? " is-open" : ""}`}
        style={{
          width: "var(--sidebar-width)",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "16px 14px",
          background: "var(--surface-card)",
          borderRight: "1px solid var(--hairline)",
        }}
      >
        <div style={{ padding: "8px 10px 20px", display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "var(--radius-md)",
              background: "var(--primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Cloud size={18} color="var(--on-primary)" strokeWidth={2.5} />
          </div>
          <h1 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>Nimbus</h1>
        </div>

        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV.map((entry) => {
            const active = view === entry.key;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => setView(entry.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  background: active ? "var(--surface-elevated)" : "transparent",
                  color: active ? "var(--text-high)" : "var(--text-med)",
                  fontWeight: active ? 600 : 500,
                  border: "none",
                  borderLeft: `3px solid ${active ? "var(--primary)" : "transparent"}`,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 14,
                  textAlign: "left",
                }}
              >
                {entry.icon}
                {entry.label}
              </button>
            );
          })}
        </nav>

        <StorageWidget usage={usage} />
      </aside>
    </>
  );
}

function Toolbar({
  browser,
  searchRef,
  onNewFolder,
  onUploadClick,
  onOpenSidebar,
}: {
  browser: ReturnType<typeof useFiles>;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onNewFolder: () => void;
  onUploadClick: () => void;
  onOpenSidebar: () => void;
}) {
  const readOnly = browser.view === "trash";
  return (
    <header
      style={{
        minHeight: "var(--header-height)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px clamp(16px, 4vw, 40px)",
        borderBottom: "1px solid var(--hairline)",
        gap: 12,
        flexWrap: "wrap",
        position: "sticky",
        top: 0,
        background: "var(--canvas)",
        zIndex: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 200 }}>
        <button
          type="button"
          className="btn-secondary sidebar-toggle"
          onClick={onOpenSidebar}
          aria-label="Open menu"
          style={{ padding: "0 12px", display: "none" }}
        >
          <FolderIcon size={16} />
        </button>

        <div style={{ position: "relative", flex: 1, maxWidth: 380 }}>
          <Search
            size={15}
            color="var(--text-low)"
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
          />
          <input
            ref={searchRef}
            type="text"
            value={browser.query}
            onChange={(e) => browser.setQuery(e.target.value)}
            placeholder="Search all files…  (press /)"
            className="form-input"
            style={{ height: 40, fontSize: 14, paddingLeft: 34, paddingRight: 30 }}
          />
          {browser.query && (
            <button
              type="button"
              onClick={() => browser.setQuery("")}
              aria-label="Clear search"
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                color: "var(--text-med)",
                cursor: "pointer",
                display: "flex",
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {browser.view === "files" && !browser.query && (
          <select
            value={browser.sort}
            onChange={(e) => browser.setSort(e.target.value as SortKey)}
            aria-label="Sort by"
            className="form-input toolbar-sort"
            style={{ height: 40, width: "auto", fontSize: 14, cursor: "pointer" }}
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        )}

        {!readOnly && (
          <>
            {/* Label text collapses to icon-only on narrow screens (see
                .btn-label in globals.css) so the toolbar fits a phone. */}
            <button
              type="button"
              onClick={onNewFolder}
              className="btn-secondary"
              aria-label="New folder"
              style={{ padding: "0 12px" }}
            >
              <FolderPlus size={16} />
              <span className="btn-label">New folder</span>
            </button>
            <button
              type="button"
              onClick={onUploadClick}
              className="btn-primary"
              aria-label="Upload"
              style={{ padding: "0 14px" }}
            >
              <Upload size={16} />
              <span className="btn-label">Upload</span>
            </button>
          </>
        )}

        <UserMenu />
      </div>
    </header>
  );
}

function Breadcrumbs({ browser }: { browser: ReturnType<typeof useFiles> }) {
  return (
    <nav
      aria-label="Breadcrumb"
      style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, marginBottom: 20 }}
    >
      {browser.trail.map((crumb, index) => {
        const last = index === browser.trail.length - 1;
        return (
          <React.Fragment key={`${crumb.id ?? "root"}-${index}`}>
            {index > 0 && <ChevronRight size={15} color="var(--text-low)" />}
            <button
              type="button"
              onClick={() => browser.navigateTo(index)}
              disabled={last}
              style={{
                background: "transparent",
                border: "none",
                padding: "2px 4px",
                cursor: last ? "default" : "pointer",
                color: last ? "var(--text-high)" : "var(--text-med)",
                fontWeight: last ? 700 : 500,
                fontSize: last ? 22 : 15,
                letterSpacing: last ? "-0.02em" : 0,
                font: "inherit",
              }}
            >
              {crumb.name}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

function SelectionBar({
  count,
  total,
  view,
  onSelectAll,
  onClear,
  onMove,
  onTrash,
  onRestore,
  onDeleteForever,
}: {
  count: number;
  total: number;
  view: View;
  onSelectAll: () => void;
  onClear: () => void;
  onMove: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onDeleteForever: () => void;
}) {
  const allSelected = count > 0 && count >= total;
  const checkboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Indeterminate has no JSX prop; some selected but not all shows a
    // dash rather than falsely claiming "none" or "all" are picked.
    if (checkboxRef.current) checkboxRef.current.indeterminate = count > 0 && !allSelected;
  }, [count, allSelected]);

  return (
    <div
      className="card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        marginBottom: 18,
        flexWrap: "wrap",
      }}
    >
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          fontSize: 14,
          color: "var(--text-high)",
        }}
      >
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={allSelected}
          onChange={() => (count > 0 ? onClear() : onSelectAll())}
          aria-label={allSelected ? "Deselect all" : "Select all"}
          style={{ accentColor: "var(--primary)", cursor: "pointer" }}
        />
        <strong>{count > 0 ? `${count} selected` : "Select all"}</strong>
      </label>
      <div style={{ flex: 1 }} />
      {count > 0 && (
        <>
          {view === "trash" ? (
            <>
              <button type="button" className="btn-secondary" onClick={onRestore}>
                <RotateCcw size={15} /> Restore
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={onDeleteForever}
                style={{ color: "var(--error)" }}
              >
                <Trash2 size={15} /> Delete forever
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn-secondary" onClick={onMove}>
                Move to…
              </button>
              <button type="button" className="btn-secondary" onClick={onTrash}>
                <Trash2 size={15} /> Trash
              </button>
            </>
          )}
          <button type="button" className="btn-secondary" onClick={onClear} aria-label="Clear selection">
            <X size={15} />
          </button>
        </>
      )}
    </div>
  );
}

function UploadList({
  uploads,
  onDismiss,
}: {
  uploads: ReturnType<typeof useFiles>["uploads"];
  onDismiss: (key: string) => void;
}) {
  return (
    <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 8 }}>
      {uploads.map((u) => (
        <div
          key={u.key}
          className="card"
          style={{ padding: "10px 14px", fontSize: 14 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {u.status === "uploading" && (
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
            )}
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              {u.name}
            </span>
            <span style={{ color: u.status === "error" ? "var(--error)" : "var(--text-med)" }}>
              {u.status === "uploading" &&
                (u.progress === null ? "Uploading…" : `${Math.round(u.progress * 100)}%`)}
              {u.status === "done" && "Done"}
              {u.status === "error" && (u.error ?? "Failed")}
            </span>
            {u.status === "error" && (
              <button
                type="button"
                onClick={() => onDismiss(u.key)}
                aria-label="Dismiss"
                style={{ background: "transparent", border: "none", color: "var(--text-med)", cursor: "pointer", display: "flex" }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          {u.status === "uploading" && u.progress !== null && (
            <div
              style={{
                marginTop: 8,
                height: 3,
                borderRadius: 2,
                background: "var(--hairline-strong)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${u.progress * 100}%`,
                  height: "100%",
                  background: "var(--primary)",
                  transition: "width 150ms linear",
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function FolderCard({
  item,
  isSelected,
  readOnly,
  onOpen,
  onToggleSelect,
  onRename,
  onTrash,
}: {
  item: Item;
  isSelected: boolean;
  readOnly: boolean;
  onOpen: () => void;
  onToggleSelect: (id: string, exclusive?: boolean) => void;
  onRename: () => void;
  onTrash: () => void;
}) {
  return (
    <div
      className="card animate-hover"
      onDoubleClick={onOpen}
      onClick={(e) => (e.metaKey || e.ctrlKey) && onToggleSelect(item.id)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        cursor: "pointer",
        outline: isSelected ? "2px solid var(--primary)" : "none",
        outlineOffset: -1,
      }}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggleSelect(item.id)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select ${item.name}`}
        style={{ accentColor: "var(--primary)", cursor: "pointer", flexShrink: 0 }}
      />
      <FolderIcon size={18} color="var(--primary)" style={{ flexShrink: 0 }} />

      <button
        type="button"
        onClick={onOpen}
        style={{
          flex: 2,
          minWidth: 0,
          background: "transparent",
          border: "none",
          padding: 0,
          color: "var(--text-high)",
          fontWeight: 600,
          fontSize: 15,
          textAlign: "left",
          cursor: "pointer",
          font: "inherit",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {item.name}
      </button>

      <span className="row-meta" style={{ flex: 1, color: "var(--text-med)", fontSize: 13 }}>
        {formatRelativeDate(item.updated_at)}
      </span>

      {!readOnly && (
        <OverflowMenu
          actions={[
            { label: "Rename", icon: <Pencil size={15} />, onClick: onRename },
            {
              label: "Move to Trash",
              icon: <Trash2 size={15} />,
              onClick: onTrash,
              destructive: true,
            },
          ]}
        />
      )}
    </div>
  );
}

function FileRow({
  item,
  isSelected,
  readOnly,
  onOpen,
  onToggleSelect,
  onDownload,
  onRename,
  onTrash,
  onRestore,
}: {
  item: Item;
  isSelected: boolean;
  readOnly: boolean;
  onOpen: () => void;
  onToggleSelect: (id: string, exclusive?: boolean) => void;
  onDownload: () => void;
  onRename: () => void;
  onTrash: () => void;
  onRestore: () => void;
}) {
  return (
    <div
      className="card animate-hover"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        outline: isSelected ? "2px solid var(--primary)" : "none",
        outlineOffset: -1,
      }}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggleSelect(item.id)}
        aria-label={`Select ${item.name}`}
        style={{ accentColor: "var(--primary)", cursor: "pointer" }}
      />
      {iconFor(item)}

      <button
        type="button"
        onClick={onOpen}
        style={{
          flex: 2,
          minWidth: 0,
          background: "transparent",
          border: "none",
          padding: 0,
          color: "var(--text-high)",
          fontWeight: 500,
          fontSize: 15,
          textAlign: "left",
          cursor: "pointer",
          font: "inherit",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {item.name}
      </button>

      <span className="row-meta" style={{ flex: 1, color: "var(--text-med)", fontSize: 13 }}>
        {item.status === "pending"
          ? "Upload incomplete"
          : formatRelativeDate(item.deleted_at ?? item.updated_at)}
      </span>
      <span
        className="row-meta"
        style={{ width: 80, textAlign: "right", color: "var(--text-med)", fontSize: 13 }}
      >
        {formatBytes(item.size)}
      </span>

      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
        {readOnly ? (
          <IconButton title="Restore" onClick={onRestore}>
            <RotateCcw size={15} />
          </IconButton>
        ) : (
          <>
            <IconButton
              title="Download"
              onClick={onDownload}
              disabled={item.status !== "ready"}
            >
              <Download size={15} />
            </IconButton>
            <OverflowMenu
              actions={[
                { label: "Rename", icon: <Pencil size={15} />, onClick: onRename },
                {
                  label: "Move to Trash",
                  icon: <Trash2 size={15} />,
                  onClick: onTrash,
                  destructive: true,
                },
              ]}
            />
          </>
        )}
      </div>
    </div>
  );
}

function IconButton({
  children,
  title,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="icon-btn"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 30,
        height: 30,
        borderRadius: "var(--radius-md)",
        background: "transparent",
        border: "none",
        color: disabled ? "var(--text-low)" : "var(--text-med)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

function EmptyState({ view, query }: { view: View; query: string }) {
  const [title, hint] = query
    ? ["Nothing matches your search", `No files or folders named “${query}”.`]
    : view === "trash"
    ? ["Trash is empty", "Deleted items appear here and stay for 30 days."]
    : view === "photos"
    ? ["No photos yet", "Upload images and they'll be grouped by date taken."]
    : view === "videos"
    ? ["No videos yet", "Upload videos and they'll show up here, newest first."]
    : view === "recent"
    ? ["Nothing recent", "Files you upload or change will show up here."]
    : ["This folder is empty", "Drag files anywhere here, or use the Upload button."];

  return (
    <div style={{ padding: "64px 0", textAlign: "center", color: "var(--text-med)" }}>
      <p style={{ fontSize: 17, fontWeight: 600, color: "var(--text-high)" }}>{title}</p>
      <p style={{ fontSize: 14, marginTop: 8 }}>{hint}</p>
    </div>
  );
}
