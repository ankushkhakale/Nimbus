"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Cloud,
  Columns2,
  Download,
  File as FileIcon,
  FileText,
  FolderInput,
  FolderPlus,
  FolderUp,
  Folder as FolderIcon,
  History,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  List,
  Loader2,
  Map as MapIcon,
  Music,
  Palette,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Search,
  Share2,
  Star,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";

import { Item, SortKey, files as filesApi } from "@/lib/api";
import { formatBytes, formatRelativeDate } from "@/lib/format";
import { Crumb, View, useFiles } from "@/lib/use-files";
import { useAuth } from "@/lib/auth-context";
import { useTranslation } from "@/lib/i18n";
import { ViewMode, getViewMode, setViewMode as persistViewMode } from "@/lib/preferences";
import { FormError } from "@/components/FormError";
import { UserMenu } from "@/components/UserMenu";
import { ConfirmModal, Modal, PromptModal } from "@/components/ui/Modal";
import { MenuAction, OverflowMenu } from "@/components/ui/OverflowMenu";
import { downloadItemsAsZip } from "@/lib/zip-download";
import { ActivityPanel } from "./ActivityPanel";
import { BulkRenameDialog } from "./BulkRenameDialog";
import { ContextMenu, ContextMenuState } from "./ContextMenu";
import { KeyboardShortcutsPanel } from "./KeyboardShortcutsPanel";
import { Lightbox } from "./Lightbox";
import { MoveDialog } from "./MoveDialog";
import { ComparePanel } from "./ComparePanel";
import { ShareDialog } from "./ShareDialog";
import { UndoAction, UndoToast } from "./UndoToast";
import { VersionHistoryDialog } from "./VersionHistoryDialog";
import { SharedWithMePanel } from "./SharedWithMePanel";
import { DuplicatesPanel } from "./DuplicatesPanel";
import { MapView } from "./MapView";
import { OnThisDay } from "./OnThisDay";
import { PhotoGrid } from "./PhotoGrid";
import { SearchFilterPanel } from "./SearchFilterPanel";
import { StorageBanner } from "./StorageBanner";
import { StorageWidget } from "./StorageWidget";

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name (A–Z)",
  name_desc: "Name (Z–A)",
  updated: "Newest first",
  updated_asc: "Oldest first",
  size: "Largest first",
  size_asc: "Smallest first",
};

// `webkitdirectory` isn't in React's HTMLInputElement attribute types
// (it's a long-standing non-standard-but-universally-supported
// attribute), so it's applied via a typed spread rather than fighting
// JSX's attribute checking with an inline cast on every use.
const DIRECTORY_INPUT_PROPS = {
  webkitdirectory: "true",
  directory: "true",
} as unknown as React.InputHTMLAttributes<HTMLInputElement>;

// The desktop-only "Upload folder" <label> targets its input by id (the
// main Upload button uses an inline overlay input instead).
const UPLOAD_FOLDER_INPUT_ID = "nimbus-upload-folder-input";

// A <label> opens its input on click for free, but isn't keyboard-operable
// on its own. This restores Enter/Space for keyboard users without giving
// up the label's mobile-reliable click behaviour.
function activateFileInputOnKey(e: React.KeyboardEvent<HTMLLabelElement>) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    document.getElementById(e.currentTarget.htmlFor)?.click();
  }
}

const NAV: { key: View; i18nKey: string; icon: React.ReactNode }[] = [
  { key: "files", i18nKey: "nav.myCloud", icon: <FolderIcon size={16} /> },
  { key: "photos", i18nKey: "nav.photos", icon: <ImageIcon size={16} /> },
  { key: "videos", i18nKey: "nav.videos", icon: <Video size={16} /> },
  { key: "starred", i18nKey: "nav.starred", icon: <Star size={16} /> },
  { key: "recent", i18nKey: "nav.recent", icon: <Clock size={16} /> },
  { key: "trash", i18nKey: "nav.trash", icon: <Trash2 size={16} /> },
];

// Walks a dropped folder's entries (the drag-and-drop counterpart to
// the webkitdirectory input, which gets this for free via
// File.webkitRelativePath) into the same {path, file} shape uploadFolder
// expects. FileSystemDirectoryReader.readEntries only returns up to 100
// entries per call and must be re-called until it returns empty, hence
// the loop rather than a single read.
async function readAllDirectoryEntries(
  reader: FileSystemDirectoryReader
): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject)
    );
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all;
}

async function walkFileSystemEntry(
  entry: FileSystemEntry,
  prefix: string,
  out: { path: string; file: File }[]
): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject)
    );
    out.push({ path: `${prefix}${entry.name}`, file });
  } else if (entry.isDirectory) {
    const children = await readAllDirectoryEntries(
      (entry as FileSystemDirectoryEntry).createReader()
    );
    await Promise.all(children.map((child) => walkFileSystemEntry(child, `${prefix}${entry.name}/`, out)));
  }
}

// Named keys only (see ALLOWED_ITEM_COLORS on the backend) — the actual
// hex values are a frontend-only styling choice.
export const ITEM_COLOR_HEX: Record<string, string> = {
  yellow: "#facc15",
  blue: "#60a5fa",
  green: "#4ade80",
  red: "#f87171",
  purple: "#c084fc",
  pink: "#f472b6",
  gray: "#9ca3af",
};

function iconFor(item: Item) {
  const ct = item.content_type ?? "";
  const custom = item.color ? ITEM_COLOR_HEX[item.color] : undefined;
  if (item.type === "folder") return <FolderIcon size={18} color={custom ?? "var(--primary)"} />;
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
  | { kind: "color"; item: Item }
  | { kind: "trash"; items: Item[] }
  | { kind: "deleteForever"; items: Item[] }
  | { kind: "move"; items: Item[] }
  | { kind: "share"; item: Item }
  | { kind: "versions"; item: Item }
  | { kind: "bulkRename"; items: Item[] };

export function FileBrowser() {
  const b = useFiles();
  const { token } = useAuth();
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [dragging, setDragging] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  // Set only when the Lightbox is opened from a list that isn't the
  // current folder page (e.g. "On this day") — lets arrow-key paging work
  // over that set instead of over items the viewer was never shown.
  const [lightboxOverride, setLightboxOverride] = useState<Item[] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [viewMode, setViewModeState] = useState<ViewMode>(() => getViewMode());
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [sharedWithMeOpen, setSharedWithMeOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [compareItems, setCompareItems] = useState<[Item, Item] | null>(null);
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [zipBusy, setZipBusy] = useState<number | null>(null); // files done, or null
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    persistViewMode(mode);
  };

  const folderInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  // Ids being dragged (all selected if the dragged item is part of the
  // selection, else just that one). A ref, not state — it changes during
  // native drag events and never needs to trigger a render.
  const draggedIds = useRef<string[]>([]);

  const { items, loading, loadingMore, error, uploads, usage, view, selected } = b;

  const folders = useMemo(() => items.filter((i) => i.type === "folder"), [items]);
  const fileItems = useMemo(() => items.filter((i) => i.type === "file"), [items]);
  // Anything openable in the viewer, so arrow keys page through a
  // coherent set rather than skipping over folders.
  const viewable = useMemo(() => fileItems, [fileItems]);
  const lightboxList = lightboxOverride ?? viewable;
  const lightboxIndex = lightboxId ? lightboxList.findIndex((i) => i.id === lightboxId) : -1;
  const closeLightbox = () => {
    setLightboxId(null);
    setLightboxOverride(null);
  };

  const guard = useCallback(async (fn: () => Promise<void>) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed.");
    }
  }, []);

  // --- bulk operations ------------------------------------------------

  // Trash with an undo affordance: restoring is exactly the reverse, so
  // the toast just calls restore on the same ids.
  const trashWithUndo = useCallback(
    (targets: Item[]) => {
      const ids = targets.map((i) => i.id);
      void guard(() => b.trashItems(ids));
      setUndo({
        key: `trash-${Date.now()}`,
        message: `${describe(targets)} moved to Trash`,
        run: () => guard(() => b.restoreItems(ids)),
      });
    },
    [b, guard]
  );

  // Move with undo: capture each item's original parent so the reversal
  // can put each back where it came from, even into different folders.
  const moveWithUndo = useCallback(
    (targets: Item[], parentId: string | null) => {
      const ids = targets.map((i) => i.id);
      const origins = new Map(targets.map((i) => [i.id, i.parent_id ?? null]));
      void guard(() => b.moveTo(ids, parentId));
      setUndo({
        key: `move-${Date.now()}`,
        message: `Moved ${describe(targets)}`,
        run: () =>
          guard(async () => {
            // Group by original parent so each destination is one call.
            const byParent = new Map<string | null, string[]>();
            for (const [id, origin] of origins) {
              byParent.set(origin, [...(byParent.get(origin) ?? []), id]);
            }
            for (const [origin, group] of byParent) {
              await b.moveTo(group, origin);
            }
          }),
      });
    },
    [b, guard]
  );

  const downloadZip = useCallback(
    (targets: Item[]) => {
      if (!token || targets.length === 0) return;
      setZipBusy(0);
      const name =
        targets.length === 1 ? targets[0].name : `Nimbus (${targets.length} items)`;
      void downloadItemsAsZip(targets, token, name, (done) => setZipBusy(done))
        .catch((err) =>
          setActionError(err instanceof Error ? err.message : "Could not build the zip.")
        )
        .finally(() => setZipBusy(null));
    },
    [token]
  );

  // Actions shown in the right-click context menu for one item. Mirrors
  // the overflow menu but is reachable by right-click anywhere on a row.
  const contextActionsFor = useCallback(
    (item: Item): MenuAction[] => {
      const inTrash = view === "trash";
      if (inTrash) {
        return [
          {
            label: "Restore",
            icon: <RotateCcw size={15} />,
            onClick: () => void guard(() => b.restoreItems([item.id])),
          },
          {
            label: "Delete forever",
            icon: <Trash2 size={15} />,
            destructive: true,
            onClick: () => setDialog({ kind: "deleteForever", items: [item] }),
          },
        ];
      }
      const actions: MenuAction[] = [
        { label: "Rename", icon: <Pencil size={15} />, onClick: () => setDialog({ kind: "rename", item }) },
        { label: "Move to…", icon: <FolderInput size={15} />, onClick: () => setDialog({ kind: "move", items: [item] }) },
        { label: "Share", icon: <Share2 size={15} />, onClick: () => setDialog({ kind: "share", item }) },
        { label: "Download", icon: <Download size={15} />, onClick: () => downloadZip([item]) },
      ];
      if (item.type === "file") {
        actions.push({
          label: "Version history",
          icon: <History size={15} />,
          onClick: () => setDialog({ kind: "versions", item }),
        });
      }
      actions.push({
        label: "Move to Trash",
        icon: <Trash2 size={15} />,
        destructive: true,
        onClick: () => trashWithUndo([item]),
      });
      return actions;
    },
    [b, guard, view, downloadZip, trashWithUndo]
  );

  const openContextMenu = useCallback(
    (item: Item, e: React.MouseEvent) => {
      e.preventDefault();
      // Right-clicking an unselected item selects just that item; if it's
      // already part of the selection, keep the selection intact.
      if (!selected.has(item.id)) b.toggleSelected(item.id, true);
      setContextMenu({ x: e.clientX, y: e.clientY, actions: contextActionsFor(item) });
    },
    [selected, b, contextActionsFor]
  );

  // --- drag to move ----------------------------------------------------

  const onItemDragStart = useCallback(
    (item: Item) => {
      // Drag the whole selection if the grabbed item is in it, else just it.
      draggedIds.current = selected.has(item.id) ? [...selected] : [item.id];
    },
    [selected]
  );

  const onDropOnFolder = useCallback(
    (folder: Item) => {
      setDragOverFolder(null);
      const ids = draggedIds.current.filter((id) => id !== folder.id);
      draggedIds.current = [];
      if (ids.length === 0) return;
      const moved = items.filter((i) => ids.includes(i.id));
      moveWithUndo(moved, folder.id);
      b.clearSelection();
    },
    [items, moveWithUndo, b]
  );

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
      if (e.key === "?" && !typing && dialog.kind === "none" && !lightboxId) {
        e.preventDefault();
        setShortcutsOpen(true);
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

  // --- paste-to-upload --------------------------------------------------

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (view === "trash" || dialog.kind !== "none" || lightboxId) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length === 0) return;
      e.preventDefault();
      void guard(() => b.upload(files));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [view, dialog.kind, lightboxId, guard, b]);

  // --- actions ---------------------------------------------------------

  const openItem = (item: Item) => {
    if (item.type === "folder") b.openFolder(item);
    else {
      setLightboxOverride(null);
      setLightboxId(item.id);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (view === "trash") return;

    const items = e.dataTransfer.items;
    const entries =
      items && items.length > 0
        ? Array.from(items)
            .map((item) => item.webkitGetAsEntry?.())
            .filter((entry): entry is FileSystemEntry => entry !== null && entry !== undefined)
        : [];

    if (entries.some((entry) => entry.isDirectory)) {
      const out: { path: string; file: File }[] = [];
      void Promise.all(entries.map((entry) => walkFileSystemEntry(entry, "", out))).then(() =>
        guard(() => b.uploadFolder(out))
      );
      return;
    }

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
        onOpenShared={() => setSharedWithMeOpen(true)}
        onOpenActivity={() => setActivityOpen(true)}
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
          onUploadFiles={(files) => void guard(() => b.upload(files))}
          onOpenSidebar={() => setSidebarOpen(true)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onOpenDuplicates={() => setDuplicatesOpen(true)}
          onOpenMap={() => setMapOpen(true)}
        />

        {/* The main Upload button carries its own overlay <input> (see
            Toolbar) — the most mobile-reliable trigger. Only the folder
            input lives here, activated by its desktop-only <label>; the
            webkitdirectory picker is desktop-only anyway. */}
        <input
          id={UPLOAD_FOLDER_INPUT_ID}
          ref={folderInput}
          type="file"
          multiple
          className="visually-hidden-input"
          {...DIRECTORY_INPUT_PROPS}
          onChange={(e) => {
            const files = e.target.files;
            if (files?.length) {
              const entries = Array.from(files).map((file) => ({
                path: file.webkitRelativePath || file.name,
                file,
              }));
              void guard(() => b.uploadFolder(entries));
            }
            e.target.value = "";
          }}
        />

        <div style={{ padding: "24px clamp(16px, 4vw, 40px)", width: "100%", maxWidth: 1600, margin: "0 auto" }}>
          {view !== "trash" && (
            <StorageBanner usage={usage} onOpenTrash={() => b.setView("trash")} />
          )}

          {view === "files" && !b.query && <Breadcrumbs browser={b} />}

          {view === "files" && !b.query && b.trail.length === 1 && (
            <OnThisDay
              onOpen={(item, all) => {
                setLightboxOverride(all);
                setLightboxId(item.id);
              }}
            />
          )}

          <FormError message={actionError ?? error} />

          {uploads.length > 0 && (
            <UploadList
              uploads={uploads}
              onDismiss={b.dismissUpload}
              onPause={b.pauseUpload}
              onResume={b.resumeUpload}
              onCancel={b.cancelUpload}
            />
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
              onCompare={
                selected.size === 2 ? () => setCompareItems(b.selectedItems as [Item, Item]) : undefined
              }
              onDownloadZip={() => downloadZip(b.selectedItems)}
              zipBusy={zipBusy}
              onBulkRename={
                selected.size >= 2
                  ? () => setDialog({ kind: "bulkRename", items: b.selectedItems })
                  : undefined
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
              onOpen={(item) => {
                setLightboxOverride(null);
                setLightboxId(item.id);
              }}
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
                        onToggleStar={() => void guard(() => b.toggleStarred(folder))}
                        onChangeColor={() => setDialog({ kind: "color", item: folder })}
                        onShare={() => setDialog({ kind: "share", item: folder })}
                        onContextMenu={(e) => openContextMenu(folder, e)}
                        onDragStartItem={() => onItemDragStart(folder)}
                        onDropItems={() => onDropOnFolder(folder)}
                        isDropTarget={dragOverFolder === folder.id}
                        onDragOverFolder={() => setDragOverFolder(folder.id)}
                        onDragLeaveFolder={() =>
                          setDragOverFolder((cur) => (cur === folder.id ? null : cur))
                        }
                      />
                    ))}
                  </div>
                </>
              )}

              {fileItems.length > 0 && (
                <>
                  <h2 style={sectionHeading}>Files</h2>
                  {view === "files" && viewMode === "grid" ? (
                    <FileGridView
                      items={fileItems}
                      selected={selected}
                      onOpen={openItem}
                      onToggleSelect={b.toggleSelected}
                    />
                  ) : (
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
                          onToggleStar={() => void guard(() => b.toggleStarred(file))}
                          onShare={() => setDialog({ kind: "share", item: file })}
                          onVersionHistory={() => setDialog({ kind: "versions", item: file })}
                          onContextMenu={(e) => openContextMenu(file, e)}
                          onDragStartItem={() => onItemDragStart(file)}
                        />
                      ))}
                    </div>
                  )}
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

      {dialog.kind === "color" && (
        <ColorPickerModal
          item={dialog.item}
          onCancel={closeDialog}
          onPick={(color) => {
            if (dialog.kind !== "color") return;
            const item = dialog.item;
            closeDialog();
            void guard(() => b.setColor(item, color));
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
          const targets = dialog.items;
          closeDialog();
          trashWithUndo(targets);
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
            const targets = dialog.kind === "move" ? dialog.items : [];
            closeDialog();
            moveWithUndo(targets, parentId);
          }}
        />
      )}

      {dialog.kind === "share" && <ShareDialog item={dialog.item} onClose={closeDialog} />}

      {dialog.kind === "versions" && (
        <VersionHistoryDialog
          item={dialog.item}
          onClose={closeDialog}
          onRestored={() => void b.reload()}
        />
      )}

      {lightboxIndex >= 0 && (
        <Lightbox
          items={lightboxList}
          index={lightboxIndex}
          onClose={closeLightbox}
          onNavigate={(next) => setLightboxId(lightboxList[next]?.id ?? null)}
          onDownload={(item) => void guard(() => b.download(item))}
          onEdited={() => void b.reload()}
        />
      )}

      {shortcutsOpen && (
        <KeyboardShortcutsPanel onClose={() => setShortcutsOpen(false)} />
      )}

      {duplicatesOpen && (
        <DuplicatesPanel
          onClose={() => setDuplicatesOpen(false)}
          onTrash={(ids) => guard(() => b.trashItems(ids))}
        />
      )}

      {mapOpen && (
        <MapView
          onClose={() => setMapOpen(false)}
          onOpen={(item, all) => {
            setMapOpen(false);
            setLightboxOverride(all);
            setLightboxId(item.id);
          }}
        />
      )}

      {sharedWithMeOpen && <SharedWithMePanel onClose={() => setSharedWithMeOpen(false)} />}

      {activityOpen && <ActivityPanel onClose={() => setActivityOpen(false)} />}

      {compareItems && (
        <ComparePanel items={compareItems} onClose={() => setCompareItems(null)} />
      )}

      {dialog.kind === "bulkRename" && (
        <BulkRenameDialog
          items={dialog.items}
          onCancel={closeDialog}
          onApply={(renames) => {
            closeDialog();
            void guard(() => b.renameMany(renames));
          }}
        />
      )}

      {contextMenu && (
        <ContextMenu state={contextMenu} onClose={() => setContextMenu(null)} />
      )}

      {undo && <UndoToast action={undo} onDismiss={() => setUndo(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ColorPickerModal({
  item,
  onCancel,
  onPick,
}: {
  item: Item;
  onCancel: () => void;
  onPick: (color: Item["color"]) => void;
}) {
  return (
    <Modal open title={`Color for "${item.name}"`} onClose={onCancel}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {(Object.entries(ITEM_COLOR_HEX) as [NonNullable<Item["color"]>, string][]).map(
          ([key, hex]) => (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key)}
              aria-label={key}
              title={key}
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: hex,
                border:
                  item.color === key
                    ? "3px solid var(--text-high)"
                    : "1px solid var(--hairline-strong)",
                cursor: "pointer",
              }}
            />
          )
        )}
        <button
          type="button"
          onClick={() => onPick(null)}
          aria-label="No color"
          title="No color"
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "transparent",
            border:
              item.color === null
                ? "3px solid var(--text-high)"
                : "1px dashed var(--hairline-strong)",
            color: "var(--text-med)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
          }}
        >
          <X size={16} />
        </button>
      </div>
    </Modal>
  );
}

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
  onOpenShared,
  onOpenActivity,
}: {
  view: View;
  setView: (v: View) => void;
  usage: ReturnType<typeof useFiles>["usage"];
  open: boolean;
  onClose: () => void;
  onOpenShared: () => void;
  onOpenActivity: () => void;
}) {
  const { t } = useTranslation();
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
                {t(entry.i18nKey)}
              </button>
            );
          })}

          <button
            type="button"
            onClick={onOpenShared}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: "var(--radius-md)",
              background: "transparent",
              color: "var(--text-med)",
              fontWeight: 500,
              border: "none",
              borderLeft: "3px solid transparent",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 14,
              textAlign: "left",
            }}
          >
            <Share2 size={16} />
            {t("nav.sharedWithMe")}
          </button>

          <button
            type="button"
            onClick={onOpenActivity}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: "var(--radius-md)",
              background: "transparent",
              color: "var(--text-med)",
              fontWeight: 500,
              border: "none",
              borderLeft: "3px solid transparent",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 14,
              textAlign: "left",
            }}
          >
            <History size={16} />
            {t("nav.activity")}
          </button>
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
  onUploadFiles,
  onOpenSidebar,
  viewMode,
  onViewModeChange,
  onOpenDuplicates,
  onOpenMap,
}: {
  browser: ReturnType<typeof useFiles>;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onNewFolder: () => void;
  onUploadFiles: (files: FileList) => void;
  onOpenSidebar: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onOpenDuplicates: () => void;
  onOpenMap: () => void;
}) {
  const { t } = useTranslation();
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
        // <main> is a column flex whose file list overflows, so it would
        // otherwise SHRINK this header to its 64px min-height floor. On
        // mobile the toolbar wraps to two rows (~110px); shrinking it back
        // to 64px spilled the second row on top of the breadcrumb below.
        // Pin the natural height so the wrapped rows stay contained.
        flexShrink: 0,
      }}
    >
      <div
        className="toolbar-search-group"
        style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 200 }}
      >
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
            placeholder={t("toolbar.search")}
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

        <SearchFilterPanel
          query={browser.query}
          filters={browser.searchFilters}
          onChange={browser.setSearchFilters}
          onApplySaved={(saved) => {
            browser.setQuery(saved.query);
            browser.setSearchFilters(saved.filters);
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        {browser.view === "photos" && !browser.query && (
          <button type="button" className="btn-secondary" onClick={onOpenMap}>
            <MapIcon size={15} />
            <span className="btn-label">Map</span>
          </button>
        )}

        {browser.view === "photos" && !browser.query && (
          <button type="button" className="btn-secondary" onClick={onOpenDuplicates}>
            <Layers size={15} />
            <span className="btn-label">Find duplicates</span>
          </button>
        )}

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

        {browser.view === "files" && !browser.query && (
          <div style={{ display: "flex", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => onViewModeChange("list")}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 38,
                height: 38,
                border: "none",
                background: viewMode === "list" ? "var(--surface-elevated)" : "transparent",
                color: viewMode === "list" ? "var(--text-high)" : "var(--text-med)",
                cursor: "pointer",
              }}
            >
              <List size={16} />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("grid")}
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 38,
                height: 38,
                border: "none",
                borderLeft: "1px solid var(--hairline-strong)",
                background: viewMode === "grid" ? "var(--surface-elevated)" : "transparent",
                color: viewMode === "grid" ? "var(--text-high)" : "var(--text-med)",
                cursor: "pointer",
              }}
            >
              <LayoutGrid size={16} />
            </button>
          </div>
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
              <span className="btn-label">{t("toolbar.newFolder")}</span>
            </button>
            {/* Folder upload relies on the webkitdirectory picker, which
                mobile browsers don't support — hidden on touch/narrow
                screens (see .desktop-only in globals.css) so it can't sit
                on top of the real Upload button and swallow taps. */}
            <label
              htmlFor={UPLOAD_FOLDER_INPUT_ID}
              className="btn-secondary desktop-only"
              aria-label="Upload folder"
              tabIndex={0}
              onKeyDown={activateFileInputOnKey}
              style={{ padding: "0 12px", cursor: "pointer" }}
            >
              <FolderUp size={16} />
              <span className="btn-label">{t("toolbar.uploadFolder")}</span>
            </label>
            {/* Invisible-overlay file input: the real <input type=file>
                sits full-size and transparent DIRECTLY on top of the button,
                so a tap on "Upload" IS a tap on the input. No label
                forwarding, no scripted .click(), no 1px-clipped input — all
                three of which mobile browsers were dropping on the floor,
                leaving uploads dead on phones with no error. This is the one
                pattern every mobile browser handles because the change event
                comes from a direct interaction with the input itself. */}
            <div className="btn-primary" style={{ position: "relative", padding: "0 14px" }}>
              <Upload size={16} />
              <span className="btn-label">{t("toolbar.upload")}</span>
              <input
                type="file"
                multiple
                aria-label="Upload"
                onChange={(e) => {
                  if (e.target.files?.length) onUploadFiles(e.target.files);
                  e.target.value = "";
                }}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  opacity: 0,
                  cursor: "pointer",
                  // 16px+ dodges iOS's focus-zoom; 0 would also work but this
                  // is defensive against any browser that measures the input.
                  fontSize: 16,
                }}
              />
            </div>
          </>
        )}

        <UserMenu />
      </div>
    </header>
  );
}

function Breadcrumbs({ browser }: { browser: ReturnType<typeof useFiles> }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

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
            <BreadcrumbDropdown
              crumb={crumb}
              open={openIndex === index}
              onToggle={() => setOpenIndex(openIndex === index ? null : index)}
              onClose={() => setOpenIndex(null)}
              onJump={(item) => {
                setOpenIndex(null);
                browser.navigateTo(index);
                browser.openFolder(item);
              }}
            />
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/** Lets you jump straight into a sibling of any ancestor folder, instead
 * of navigating there and then clicking in one level at a time. */
function BreadcrumbDropdown({
  crumb,
  open,
  onToggle,
  onClose,
  onJump,
}: {
  crumb: Crumb;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onJump: (folder: Item) => void;
}) {
  const { token } = useAuth();
  const [folders, setFolders] = useState<Item[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !token) return;
    let active = true;
    filesApi
      .list(token, crumb.id, { limit: 200, sort: "name" })
      .then((page) => {
        if (active) setFolders(page.items.filter((i) => i.type === "folder"));
      })
      .catch(() => active && setFolders([]));
    return () => {
      active = false;
    };
  }, [open, token, crumb.id]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open, onClose]);

  return (
    <div ref={ref} style={{ position: "relative", display: "flex" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Jump to a subfolder of ${crumb.name}`}
        aria-expanded={open}
        style={{
          background: "transparent",
          border: "none",
          padding: 2,
          cursor: "pointer",
          color: "var(--text-low)",
          display: "flex",
        }}
      >
        <ChevronDown size={13} />
      </button>

      {open && (
        <div
          className="card"
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            minWidth: 200,
            maxHeight: 280,
            overflowY: "auto",
            padding: 6,
            zIndex: 40,
          }}
        >
          {folders === null ? (
            <p style={{ padding: 10, fontSize: 13, color: "var(--text-med)" }}>Loading…</p>
          ) : folders.length === 0 ? (
            <p style={{ padding: 10, fontSize: 13, color: "var(--text-med)" }}>
              No subfolders here.
            </p>
          ) : (
            folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                role="menuitem"
                onClick={() => onJump(folder)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 10px",
                  background: "transparent",
                  border: "none",
                  borderRadius: 6,
                  color: "var(--text-high)",
                  fontSize: 14,
                  textAlign: "left",
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                <FolderIcon size={15} color="var(--primary)" />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {folder.name}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
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
  onCompare,
  onDownloadZip,
  zipBusy,
  onBulkRename,
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
  onCompare?: () => void;
  onDownloadZip: () => void;
  zipBusy: number | null;
  onBulkRename?: () => void;
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
              {onCompare && (
                <button type="button" className="btn-secondary" onClick={onCompare}>
                  <Columns2 size={15} /> Compare
                </button>
              )}
              {onBulkRename && (
                <button type="button" className="btn-secondary" onClick={onBulkRename}>
                  <Pencil size={15} /> Rename
                </button>
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={onDownloadZip}
                disabled={zipBusy !== null}
              >
                {zipBusy !== null ? (
                  <>
                    <Loader2 size={15} className="spin" /> Zipping {zipBusy}…
                  </>
                ) : (
                  <>
                    <Download size={15} /> Download ZIP
                  </>
                )}
              </button>
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
  onPause,
  onResume,
  onCancel,
}: {
  uploads: ReturnType<typeof useFiles>["uploads"];
  onDismiss: (key: string) => void;
  onPause: (key: string) => void;
  onResume: (key: string) => void;
  onCancel: (key: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 8 }}>
      {uploads.map((u) => {
        const active = u.status === "uploading" || u.status === "paused";
        return (
          <div
            key={u.key}
            className="card"
            style={{ padding: "10px 14px", fontSize: 14 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {u.status === "uploading" && (
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              )}
              {u.status === "paused" && <Pause size={14} style={{ color: "var(--text-med)" }} />}
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {u.name}
              </span>
              <span style={{ color: u.status === "error" ? "var(--error)" : "var(--text-med)" }}>
                {u.status === "uploading" &&
                  (u.progress === null ? "Uploading…" : `${Math.round(u.progress * 100)}%`)}
                {u.status === "paused" &&
                  `Paused${u.progress ? ` · ${Math.round(u.progress * 100)}%` : ""}`}
                {u.status === "done" && "Done"}
                {u.status === "error" && (u.error ?? "Failed")}
              </span>
              {/* Pause / resume toggle while the upload is running. */}
              {active && (
                <button
                  type="button"
                  onClick={() => (u.status === "paused" ? onResume(u.key) : onPause(u.key))}
                  aria-label={u.status === "paused" ? t("upload.resume") : t("upload.pause")}
                  title={u.status === "paused" ? t("upload.resume") : t("upload.pause")}
                  style={iconBtnStyle}
                >
                  {u.status === "paused" ? <Play size={14} /> : <Pause size={14} />}
                </button>
              )}
              {/* Cancel an in-flight upload, or dismiss a finished/failed row. */}
              {(active || u.status === "error") && (
                <button
                  type="button"
                  onClick={() => (active ? onCancel(u.key) : onDismiss(u.key))}
                  aria-label={active ? t("upload.cancel") : t("common.dismiss")}
                  title={active ? t("upload.cancel") : t("common.dismiss")}
                  style={iconBtnStyle}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {active && u.progress !== null && (
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
                    background: u.status === "paused" ? "var(--text-med)" : "var(--primary)",
                    transition: "width 150ms linear",
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--text-med)",
  cursor: "pointer",
  display: "flex",
  padding: 2,
};

function FolderCard({
  item,
  isSelected,
  readOnly,
  onOpen,
  onToggleSelect,
  onRename,
  onTrash,
  onToggleStar,
  onChangeColor,
  onShare,
  onContextMenu,
  onDragStartItem,
  onDropItems,
  isDropTarget,
  onDragOverFolder,
  onDragLeaveFolder,
}: {
  item: Item;
  isSelected: boolean;
  readOnly: boolean;
  onOpen: () => void;
  onToggleSelect: (id: string, exclusive?: boolean) => void;
  onRename: () => void;
  onTrash: () => void;
  onToggleStar: () => void;
  onChangeColor: () => void;
  onShare: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStartItem: () => void;
  onDropItems: () => void;
  isDropTarget: boolean;
  onDragOverFolder: () => void;
  onDragLeaveFolder: () => void;
}) {
  return (
    <div
      className="card animate-hover"
      draggable={!readOnly}
      onDragStart={onDragStartItem}
      onContextMenu={onContextMenu}
      onDragOver={(e) => {
        if (readOnly) return;
        e.preventDefault();
        onDragOverFolder();
      }}
      onDragLeave={onDragLeaveFolder}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDropItems();
      }}
      onDoubleClick={onOpen}
      onClick={(e) => (e.metaKey || e.ctrlKey) && onToggleSelect(item.id)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        cursor: "pointer",
        outline: isDropTarget
          ? "2px solid var(--primary)"
          : isSelected
            ? "2px solid var(--primary)"
            : "none",
        outlineOffset: -1,
        background: isDropTarget ? "var(--surface-elevated)" : undefined,
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
      <FolderIcon
        size={18}
        color={item.color ? ITEM_COLOR_HEX[item.color] : "var(--primary)"}
        style={{ flexShrink: 0 }}
      />
      {item.starred && <Star size={13} color="var(--primary)" fill="var(--primary)" style={{ flexShrink: 0 }} />}

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
            {
              label: item.starred ? "Unstar" : "Star",
              icon: <Star size={15} />,
              onClick: onToggleStar,
            },
            { label: "Change color", icon: <Palette size={15} />, onClick: onChangeColor },
            { label: "Rename", icon: <Pencil size={15} />, onClick: onRename },
            { label: "Share", icon: <Share2 size={15} />, onClick: onShare },
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
  onToggleStar,
  onShare,
  onVersionHistory,
  onContextMenu,
  onDragStartItem,
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
  onToggleStar: () => void;
  onShare: () => void;
  onVersionHistory: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStartItem: () => void;
}) {
  return (
    <div
      className="card animate-hover"
      draggable={!readOnly}
      onDragStart={onDragStartItem}
      onContextMenu={onContextMenu}
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
      {item.starred && <Star size={13} color="var(--primary)" fill="var(--primary)" style={{ flexShrink: 0 }} />}

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
                {
                  label: item.starred ? "Unstar" : "Star",
                  icon: <Star size={15} />,
                  onClick: onToggleStar,
                },
                { label: "Rename", icon: <Pencil size={15} />, onClick: onRename },
                { label: "Share", icon: <Share2 size={15} />, onClick: onShare },
                { label: "Version history", icon: <History size={15} />, onClick: onVersionHistory },
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

function FileGridView({
  items,
  selected,
  onOpen,
  onToggleSelect,
}: {
  items: Item[];
  selected: Set<string>;
  onOpen: (item: Item) => void;
  onToggleSelect: (id: string, exclusive?: boolean) => void;
}) {
  const { token } = useAuth();
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token) return;
    const images = items.filter((i) => (i.content_type ?? "").startsWith("image/"));
    const missing = images.map((i) => i.id).filter((id) => !(id in urls));
    if (missing.length === 0) return;
    let active = true;
    filesApi
      .thumbnailUrls(token, missing)
      .then(({ urls: signed }) => {
        if (!active) return;
        setUrls((prev) => ({
          ...prev,
          ...Object.fromEntries(signed.map((s) => [s.item_id, s.url])),
        }));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // `urls` intentionally excluded — including it would re-fetch on
    // every successful batch and loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, items]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 10,
      }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          role="button"
          tabIndex={0}
          title={item.name}
          onClick={(e) => (e.metaKey || e.ctrlKey ? onToggleSelect(item.id) : onOpen(item))}
          className="card animate-hover"
          style={{
            padding: 10,
            cursor: "pointer",
            outline: selected.has(item.id) ? "2px solid var(--primary)" : "none",
            outlineOffset: -1,
          }}
        >
          <div
            style={{
              position: "relative",
              aspectRatio: "1 / 1",
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
              background: "var(--surface-elevated)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 8,
            }}
          >
            {urls[item.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={urls[item.id]}
                alt={item.name}
                loading="lazy"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              iconFor(item)
            )}
            {item.starred && (
              <Star
                size={13}
                color="var(--primary)"
                fill="var(--primary)"
                style={{ position: "absolute", top: 6, right: 6 }}
              />
            )}
            <input
              type="checkbox"
              checked={selected.has(item.id)}
              onChange={() => onToggleSelect(item.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select ${item.name}`}
              style={{
                position: "absolute",
                top: 6,
                left: 6,
                accentColor: "var(--primary)",
                cursor: "pointer",
              }}
            />
          </div>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-high)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.name}
          </p>
        </div>
      ))}
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
    : view === "starred"
    ? ["Nothing starred yet", "Star a file or folder and it'll show up here."]
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
