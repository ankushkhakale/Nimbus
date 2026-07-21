"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Download,
  File as FileIcon,
  FolderPlus,
  Folder as FolderIcon,
  Grid3x3,
  Image as ImageIcon,
  List,
  Loader2,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";

import { Item } from "@/lib/api";
import { formatBytes, formatRelativeDate, isImage } from "@/lib/format";
import { useFiles } from "@/lib/use-files";
import { FormError } from "@/components/FormError";
import { PhotoGrid } from "./PhotoGrid";
import { StorageWidget } from "./StorageWidget";

type View = "files" | "photos";

export function FileBrowser() {
  const browser = useFiles();
  const [view, setView] = useState<View>("files");
  const [dragging, setDragging] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const { items, loading, error, uploads, usage } = browser;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  }, [items, search]);

  const folders = visible.filter((i) => i.type === "folder");
  const fileItems = visible.filter((i) => i.type === "file");
  const photos = fileItems.filter((i) => isImage(i.content_type));

  const guard = async (fn: () => Promise<void>) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed.");
    }
  };

  const handleNewFolder = () => {
    const name = window.prompt("Folder name");
    if (name?.trim()) void guard(() => browser.createFolder(name.trim()));
  };

  const handleRename = (item: Item) => {
    const name = window.prompt("Rename to", item.name);
    if (name?.trim() && name.trim() !== item.name) {
      void guard(() => browser.rename(item, name.trim()));
    }
  };

  const handleDelete = (item: Item) => {
    const extra = item.type === "folder" ? " and everything inside it" : "";
    if (window.confirm(`Delete "${item.name}"${extra}? This cannot be undone.`)) {
      void guard(() => browser.remove(item));
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) void guard(() => browser.upload(e.dataTransfer.files));
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <aside
        className="glass-panel"
        style={{
          width: "var(--sidebar-width)",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "var(--spacing-base) 16px",
          borderRight: "1px solid var(--border-glow)",
        }}
      >
        <div style={{ padding: "24px 16px", display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              background: "var(--primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 15px var(--primary-hover)",
            }}
          >
            <FolderIcon size={20} color="white" />
          </div>
          <h1 style={{ fontSize: "20px", margin: 0, fontWeight: 700 }}>Nimbus</h1>
        </div>

        <nav
          style={{
            flex: 1,
            marginTop: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {([
            { key: "files", label: "My Cloud", icon: <FolderIcon size={16} /> },
            { key: "photos", label: "Photos", icon: <ImageIcon size={16} /> },
          ] as const).map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setView(entry.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "12px 16px",
                borderRadius: "var(--radius-sm)",
                background: view === entry.key ? "rgba(99, 102, 241, 0.15)" : "transparent",
                color: view === entry.key ? "var(--text-high)" : "var(--text-med)",
                fontWeight: view === entry.key ? 600 : 500,
                borderLeft:
                  view === entry.key ? "3px solid var(--primary)" : "3px solid transparent",
                border: "none",
                borderLeftStyle: "solid",
                cursor: "pointer",
                font: "inherit",
                textAlign: "left",
              }}
            >
              {entry.icon}
              {entry.label}
            </button>
          ))}
        </nav>

        <StorageWidget usage={usage} />
      </aside>

      {/* Main */}
      <main
        style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <header
          style={{
            height: "var(--header-height)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 40px",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            gap: "16px",
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search in this folder…"
            className="glass-panel"
            style={{
              padding: "10px 16px",
              borderRadius: "24px",
              width: "360px",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--text-high)",
              outline: "none",
              fontSize: "14px",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button type="button" onClick={handleNewFolder} className="btn-oauth" style={toolbarBtn}>
              <FolderPlus size={16} /> New folder
            </button>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="btn-oauth"
              style={{ ...toolbarBtn, background: "var(--primary)", color: "white" }}
            >
              <Upload size={16} /> Upload
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) void guard(() => browser.upload(e.target.files!));
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => setView(view === "files" ? "photos" : "files")}
              title={view === "files" ? "Photo grid" : "File list"}
              style={{ ...toolbarBtn, padding: "8px" }}
              className="btn-oauth"
            >
              {view === "files" ? <Grid3x3 size={16} /> : <List size={16} />}
            </button>
          </div>
        </header>

        <div style={{ padding: "32px 40px", maxWidth: "1600px", margin: "0 auto", width: "100%" }}>
          {/* Breadcrumbs */}
          <nav
            aria-label="Breadcrumb"
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "4px",
              marginBottom: "24px",
            }}
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
                      padding: "4px 6px",
                      borderRadius: "6px",
                      cursor: last ? "default" : "pointer",
                      color: last ? "var(--text-high)" : "var(--text-med)",
                      fontWeight: last ? 600 : 500,
                      fontSize: last ? "22px" : "15px",
                      font: "inherit",
                    }}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              );
            })}
          </nav>

          <FormError message={actionError ?? error} />

          {/* Upload progress */}
          {uploads.length > 0 && (
            <div style={{ marginBottom: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {uploads.map((u) => (
                <div
                  key={u.key}
                  className="glass-panel"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 16px",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "14px",
                    color: u.status === "error" ? "#fca5a5" : "var(--text-med)",
                  }}
                >
                  {u.status === "uploading" && (
                    <Loader2 size={15} className="animate-spin" style={{ animation: "spin 1s linear infinite" }} />
                  )}
                  <span style={{ flex: 1 }}>{u.name}</span>
                  <span>
                    {u.status === "uploading" && "Uploading…"}
                    {u.status === "done" && "Done"}
                    {u.status === "error" && (u.error ?? "Failed")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <p style={{ color: "var(--text-med)" }}>Loading…</p>
          ) : view === "photos" ? (
            photos.length === 0 ? (
              <EmptyState
                title="No photos here"
                hint="Upload images and they'll appear grouped by date."
              />
            ) : (
              <PhotoGrid photos={photos} />
            )
          ) : visible.length === 0 ? (
            <EmptyState
              title={search ? "Nothing matches your search" : "This folder is empty"}
              hint={search ? undefined : "Drag files anywhere here, or use the Upload button."}
            />
          ) : (
            <>
              {folders.length > 0 && (
                <>
                  <h2 style={sectionHeading}>Folders</h2>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                      gap: "16px",
                      marginBottom: "40px",
                    }}
                  >
                    {folders.map((folder) => (
                      <div
                        key={folder.id}
                        className="glass-panel-elevated animate-hover"
                        onDoubleClick={() => browser.openFolder(folder)}
                        style={{
                          padding: "20px",
                          borderRadius: "var(--radius-xl)",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <FolderIcon
                            size={34}
                            fill="var(--primary)"
                            fillOpacity={0.2}
                            color="var(--primary)"
                          />
                          <RowActions
                            onRename={() => handleRename(folder)}
                            onDelete={() => handleDelete(folder)}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => browser.openFolder(folder)}
                          style={{
                            marginTop: "14px",
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            color: "var(--text-high)",
                            fontSize: "15px",
                            fontWeight: 600,
                            cursor: "pointer",
                            textAlign: "left",
                            font: "inherit",
                            wordBreak: "break-word",
                          }}
                        >
                          {folder.name}
                        </button>
                        <p style={{ fontSize: "12px", color: "var(--text-med)", marginTop: "4px" }}>
                          {formatRelativeDate(folder.updated_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {fileItems.length > 0 && (
                <>
                  <h2 style={sectionHeading}>Files</h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {fileItems.map((file) => (
                      <div
                        key={file.id}
                        className="glass-panel animate-hover"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "16px",
                          padding: "14px 20px",
                          borderRadius: "var(--radius-md)",
                        }}
                      >
                        {isImage(file.content_type) ? (
                          <ImageIcon size={20} color="var(--text-med)" />
                        ) : (
                          <FileIcon size={20} color="var(--text-med)" />
                        )}
                        <span style={{ flex: 2, fontWeight: 500, wordBreak: "break-word" }}>
                          {file.name}
                        </span>
                        <span style={{ flex: 1, color: "var(--text-med)", fontSize: "14px" }}>
                          {file.status === "pending" ? "Upload incomplete" : formatRelativeDate(file.updated_at)}
                        </span>
                        <span
                          style={{
                            width: "90px",
                            color: "var(--text-med)",
                            fontSize: "14px",
                            textAlign: "right",
                          }}
                        >
                          {formatBytes(file.size)}
                        </span>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <IconButton
                            title="Download"
                            disabled={file.status !== "ready"}
                            onClick={() => void guard(() => browser.download(file))}
                          >
                            <Download size={15} />
                          </IconButton>
                          <RowActions
                            onRename={() => handleRename(file)}
                            onDelete={() => handleDelete(file)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>

      {/* Drag overlay */}
      {dragging && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(99,102,241,0.12)",
            border: "2px dashed var(--primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "20px",
            fontWeight: 600,
            pointerEvents: "none",
            zIndex: 100,
          }}
        >
          Drop files to upload
        </div>
      )}
    </div>
  );
}

const toolbarBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "9px 14px",
  borderRadius: "10px",
  fontSize: "14px",
  cursor: "pointer",
  width: "auto",
};

const sectionHeading: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 600,
  color: "var(--text-med)",
  marginBottom: "14px",
};

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
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "30px",
        height: "30px",
        borderRadius: "8px",
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

function RowActions({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  return (
    <div style={{ display: "flex", gap: "4px" }}>
      <IconButton title="Rename" onClick={onRename}>
        <Pencil size={15} />
      </IconButton>
      <IconButton title="Delete" onClick={onDelete}>
        <Trash2 size={15} />
      </IconButton>
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ padding: "64px 0", textAlign: "center", color: "var(--text-med)" }}>
      <p style={{ fontSize: "17px", fontWeight: 600, color: "var(--text-high)" }}>{title}</p>
      {hint && <p style={{ fontSize: "14px", marginTop: "8px" }}>{hint}</p>}
    </div>
  );
}
