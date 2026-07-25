"use client";

/**
 * Version history for one file: list prior versions, download or restore
 * any of them, and upload a new version (which snapshots the current
 * bytes first). Retention is bounded server-side, so the oldest versions
 * age out — the list reflects only what's still kept.
 */

import { useEffect, useRef, useState } from "react";
import { Download, History, Loader2, RotateCcw, Upload, X } from "lucide-react";

import { FileVersion, Item, files as filesApi, uploadToS3 } from "@/lib/api";
import { formatBytes, formatRelativeDate } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

export function VersionHistoryDialog({
  item,
  onClose,
  onRestored,
}: {
  item: Item;
  onClose: () => void;
  onRestored: () => void;
}) {
  const { token } = useAuth();
  const [versions, setVersions] = useState<FileVersion[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // "upload" | version id
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = () => {
    if (!token) return;
    filesApi
      .versions(token, item.id)
      .then(({ versions: v }) => setVersions(v))
      .catch(() => setVersions([]));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, item.id]);

  const handleUploadNewVersion = async (file: File) => {
    if (!token) return;
    setBusy("upload");
    setError(null);
    try {
      const { upload_url } = await filesApi.newVersionUploadUrl(token, item.id);
      await uploadToS3(upload_url, file, file.type || "application/octet-stream");
      await filesApi.completeNewVersion(token, item.id);
      reload();
      onRestored();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the new version.");
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async (version: FileVersion) => {
    if (!token) return;
    try {
      const { download_url } = await filesApi.versionDownloadUrl(token, item.id, version.id);
      window.location.assign(download_url);
    } catch {
      setError("Could not get a download link for that version.");
    }
  };

  const handleRestore = async (version: FileVersion) => {
    if (!token) return;
    setBusy(version.id);
    setError(null);
    try {
      await filesApi.restoreVersion(token, item.id, version.id);
      reload();
      onRestored();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore that version.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Version history for ${item.name}`}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 260,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 560, maxHeight: "80vh", display: "flex", flexDirection: "column" }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--hairline)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <History size={18} color="var(--text-med)" />
            <p style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Version history — {item.name}
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose} aria-label="Close" style={{ padding: "0 10px" }}>
            <X size={16} />
          </button>
        </header>

        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--hairline)" }}>
          <input
            ref={fileInput}
            type="file"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUploadNewVersion(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileInput.current?.click()}
            disabled={busy === "upload"}
          >
            {busy === "upload" ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}
            Upload new version
          </button>
          <p style={{ fontSize: 12, color: "var(--text-low)", marginTop: 8 }}>
            The current file becomes a version, so you can always roll back.
          </p>
        </div>

        {error && (
          <p style={{ color: "var(--error)", fontSize: 13, padding: "10px 20px 0" }}>{error}</p>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px 16px" }}>
          {versions === null ? (
            <p style={{ color: "var(--text-med)", padding: "12px 0" }}>Loading…</p>
          ) : versions.length === 0 ? (
            <p style={{ color: "var(--text-med)", padding: "12px 0" }}>
              No prior versions yet. Editing or uploading a new version keeps the old one here.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {versions.map((version) => (
                <div
                  key={version.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    border: "1px solid var(--hairline)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600 }}>Version {version.version_number}</p>
                    <p style={{ fontSize: 12, color: "var(--text-med)" }}>
                      {version.size !== null ? formatBytes(version.size) : "—"} ·{" "}
                      {formatRelativeDate(version.created_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void handleDownload(version)}
                    aria-label="Download this version"
                    style={{ padding: "0 10px" }}
                  >
                    <Download size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void handleRestore(version)}
                    disabled={busy === version.id}
                    style={{ padding: "0 12px" }}
                  >
                    {busy === version.id ? <Loader2 size={14} className="spin" /> : <RotateCcw size={14} />}
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
