"use client";

/** State for the file browser: current folder, contents, uploads, usage. */

import { useCallback, useEffect, useRef, useState } from "react";

import { Item, Usage, files as filesApi, uploadToS3 } from "./api";
import { useAuth } from "./auth-context";

export interface Crumb {
  id: string | null;
  name: string;
}

export interface UploadProgress {
  /** Local id; the server item id does not exist until the request returns. */
  key: string;
  name: string;
  status: "uploading" | "done" | "error";
  error?: string;
}

const ROOT: Crumb = { id: null, name: "My Cloud" };

export function useFiles() {
  const { token } = useAuth();

  const [trail, setTrail] = useState<Crumb[]>([ROOT]);
  const [items, setItems] = useState<Item[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);

  const current = trail[trail.length - 1];

  // Folder changes and refreshes race; only the newest result may land.
  const requestSeq = useRef(0);

  const refresh = useCallback(
    async (folderId: string | null) => {
      if (!token) return;
      const seq = ++requestSeq.current;
      setLoading(true);
      setError(null);
      try {
        const [contents, stats] = await Promise.all([
          filesApi.list(token, folderId),
          filesApi.usage(token),
        ]);
        if (seq !== requestSeq.current) return; // superseded
        setItems(contents);
        setUsage(stats);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : "Could not load your files.");
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void refresh(current.id);
  }, [refresh, current.id]);

  const openFolder = useCallback((item: Item) => {
    setTrail((t) => [...t, { id: item.id, name: item.name }]);
  }, []);

  const navigateTo = useCallback((index: number) => {
    setTrail((t) => t.slice(0, index + 1));
  }, []);

  const createFolder = useCallback(
    async (name: string) => {
      if (!token) return;
      await filesApi.createFolder(token, name, current.id);
      await refresh(current.id);
    },
    [token, current.id, refresh]
  );

  const remove = useCallback(
    async (item: Item) => {
      if (!token) return;
      await filesApi.remove(token, item.id);
      await refresh(current.id);
    },
    [token, current.id, refresh]
  );

  const rename = useCallback(
    async (item: Item, name: string) => {
      if (!token) return;
      await filesApi.update(token, item.id, { name });
      await refresh(current.id);
    },
    [token, current.id, refresh]
  );

  const download = useCallback(
    async (item: Item) => {
      if (!token) return;
      const { download_url } = await filesApi.downloadUrl(token, item.id);
      // The presigned URL carries Content-Disposition: attachment, so
      // navigating to it downloads rather than replacing the page.
      window.location.href = download_url;
    },
    [token]
  );

  const upload = useCallback(
    async (fileList: FileList | File[]) => {
      if (!token) return;
      const chosen = Array.from(fileList);
      const parentId = current.id;

      await Promise.all(
        chosen.map(async (file, index) => {
          const key = `${Date.now()}-${index}-${file.name}`;
          setUploads((u) => [...u, { key, name: file.name, status: "uploading" }]);
          try {
            const contentType = file.type || "application/octet-stream";
            const { item, upload_url } = await filesApi.requestUploadUrl(
              token,
              file.name,
              parentId,
              contentType
            );
            // Straight to S3 — the bytes never pass through the API.
            await uploadToS3(upload_url, file, contentType);
            // Only now does the server confirm the object and record size.
            await filesApi.completeUpload(token, item.id);
            setUploads((u) =>
              u.map((p) => (p.key === key ? { ...p, status: "done" } : p))
            );
          } catch (err) {
            setUploads((u) =>
              u.map((p) =>
                p.key === key
                  ? {
                      ...p,
                      status: "error",
                      error: err instanceof Error ? err.message : "Upload failed",
                    }
                  : p
              )
            );
          }
        })
      );

      await refresh(parentId);
      // Clear finished entries shortly after, leaving failures visible.
      setTimeout(() => setUploads((u) => u.filter((p) => p.status === "error")), 2500);
    },
    [token, current.id, refresh]
  );

  return {
    trail,
    current,
    items,
    usage,
    loading,
    error,
    uploads,
    openFolder,
    navigateTo,
    createFolder,
    remove,
    rename,
    download,
    upload,
    refresh: () => refresh(current.id),
  };
}
