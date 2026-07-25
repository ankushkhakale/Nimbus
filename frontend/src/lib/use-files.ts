"use client";

/**
 * State for the file browser.
 *
 * Owns the current view, the folder trail, one page of items at a time,
 * the selection, and in-flight uploads. Listing is paginated because a
 * migrated Takeout album can hold thousands of items in one folder.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Item,
  Page,
  SortKey,
  UsageDetail,
  files as filesApi,
  uploadToS3,
} from "./api";
import { useAuth } from "./auth-context";
import { notify } from "./notify";
import { getDefaultView, getFolderSort, setFolderSort } from "./preferences";

export type View = "files" | "photos" | "videos" | "starred" | "recent" | "trash";

export interface Crumb {
  id: string | null;
  name: string;
}

export interface UploadProgress {
  /** Local id; the server item id does not exist until the request returns. */
  key: string;
  name: string;
  /** 0-1. Stays null until the browser reports its first progress event. */
  progress: number | null;
  status: "uploading" | "done" | "error";
  error?: string;
}

const ROOT: Crumb = { id: null, name: "My Cloud" };
const PAGE_SIZE = 60;

export function useFiles() {
  const { token } = useAuth();

  const [view, setViewRaw] = useState<View>(() => getDefaultView());
  const [trail, setTrail] = useState<Crumb[]>([ROOT]);
  const [sort, setSortRaw] = useState<SortKey>(() => getFolderSort(null) ?? "name");
  const [query, setQuery] = useState("");

  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [usage, setUsage] = useState<UsageDetail | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploads, setUploads] = useState<UploadProgress[]>([]);

  const current = trail[trail.length - 1];

  // Each folder remembers its own sort choice (e.g. a Downloads folder
  // sorted by date vs. a Photos folder sorted by name). Switching folders
  // restores whatever was last picked there, falling back to the current
  // value rather than resetting to "name" every time.
  useEffect(() => {
    const stored = getFolderSort(current.id);
    if (stored) setSortRaw(stored);
  }, [current.id]);

  const setSort = useCallback(
    (next: SortKey) => {
      setSortRaw(next);
      setFolderSort(current.id, next);
    },
    [current.id]
  );

  // Folder changes, view switches and searches all race. Only the newest
  // response may write to state, or a slow earlier one overwrites it.
  const requestSeq = useRef(0);

  const fetchPage = useCallback(
    async (offset: number): Promise<Page<Item>> => {
      if (!token) return { items: [], total: 0, offset, limit: PAGE_SIZE };
      const opts = { offset, limit: PAGE_SIZE };

      // A search overrides whatever view is active — people expect the
      // results, not their previous folder.
      if (query.trim()) return filesApi.search(token, query.trim(), opts);

      switch (view) {
        case "photos":
          return filesApi.photos(token, opts);
        case "videos":
          return filesApi.videos(token, opts);
        case "starred":
          return filesApi.starred(token, opts);
        case "trash":
          return filesApi.trash(token, opts);
        case "recent": {
          const recent = await filesApi.recent(token, PAGE_SIZE);
          return { items: recent, total: recent.length, offset: 0, limit: PAGE_SIZE };
        }
        default:
          return filesApi.list(token, current.id, { ...opts, sort });
      }
    },
    [token, view, query, current.id, sort]
  );

  const reload = useCallback(async () => {
    if (!token) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const [page, stats] = await Promise.all([fetchPage(0), filesApi.usageDetail(token)]);
      if (seq !== requestSeq.current) return; // superseded
      setItems(page.items);
      setTotal(page.total);
      setUsage(stats);
      setSelected(new Set());
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : "Could not load your files.");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [token, fetchPage]);

  // Debounced so typing in the search box does not fire a request per key.
  useEffect(() => {
    const timer = setTimeout(() => void reload(), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [reload, query]);

  const hasMore = items.length < total;

  const loadMore = useCallback(async () => {
    if (!token || loadingMore || !hasMore) return;
    const seq = requestSeq.current;
    setLoadingMore(true);
    try {
      const page = await fetchPage(items.length);
      if (seq !== requestSeq.current) return;
      // Deduplicated: an item created between pages would otherwise shift
      // the offset and show up twice.
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...page.items.filter((i) => !seen.has(i.id))];
      });
      setTotal(page.total);
    } catch {
      /* keep what is already on screen */
    } finally {
      setLoadingMore(false);
    }
  }, [token, loadingMore, hasMore, fetchPage, items.length]);

  // --- navigation ---------------------------------------------------

  const setView = useCallback((next: View) => {
    setViewRaw(next);
    setQuery("");
    setSelected(new Set());
    if (next === "files") setTrail([ROOT]);
  }, []);

  const openFolder = useCallback((item: Item) => {
    setTrail((t) => [...t, { id: item.id, name: item.name }]);
    setSelected(new Set());
  }, []);

  const navigateTo = useCallback((index: number) => {
    setTrail((t) => t.slice(0, index + 1));
    setSelected(new Set());
  }, []);

  // --- selection ------------------------------------------------------

  const toggleSelected = useCallback((id: string, exclusive = false) => {
    setSelected((prev) => {
      if (exclusive) return new Set(prev.has(id) && prev.size === 1 ? [] : [id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => setSelected(new Set(items.map((i) => i.id))), [items]);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const selectedItems = useMemo(
    () => items.filter((i) => selected.has(i.id)),
    [items, selected]
  );

  // --- mutations ------------------------------------------------------

  const createFolder = useCallback(
    async (name: string) => {
      if (!token) return;
      await filesApi.createFolder(token, name, current.id);
      await reload();
    },
    [token, current.id, reload]
  );

  const rename = useCallback(
    async (item: Item, name: string) => {
      if (!token) return;
      await filesApi.update(token, item.id, { name });
      await reload();
    },
    [token, reload]
  );

  const moveTo = useCallback(
    async (itemIds: string[], parentId: string | null) => {
      if (!token || itemIds.length === 0) return;
      await filesApi.moveMany(token, itemIds, parentId);
      await reload();
    },
    [token, reload]
  );

  const setColor = useCallback(
    async (item: Item, color: Item["color"]) => {
      if (!token) return;
      await filesApi.update(token, item.id, { color });
      await reload();
    },
    [token, reload]
  );

  const toggleStarred = useCallback(
    async (item: Item) => {
      if (!token) return;
      if (item.starred) await filesApi.unstar(token, [item.id]);
      else await filesApi.star(token, [item.id]);
      await reload();
    },
    [token, reload]
  );

  const trashItems = useCallback(
    async (itemIds: string[]) => {
      if (!token || itemIds.length === 0) return;
      await filesApi.trashMany(token, itemIds);
      await reload();
    },
    [token, reload]
  );

  const restoreItems = useCallback(
    async (itemIds: string[]) => {
      if (!token || itemIds.length === 0) return;
      await filesApi.restoreMany(token, itemIds);
      await reload();
    },
    [token, reload]
  );

  const deleteForever = useCallback(
    async (itemIds: string[]) => {
      if (!token || itemIds.length === 0) return;
      await filesApi.deleteForever(token, itemIds);
      await reload();
    },
    [token, reload]
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

  // --- uploads --------------------------------------------------------

  const upload = useCallback(
    async (fileList: FileList | File[]) => {
      if (!token) return;
      const chosen = Array.from(fileList);
      const parentId = current.id;

      await Promise.all(
        chosen.map(async (file, index) => {
          const key = `${index}-${file.name}-${file.size}`;
          setUploads((u) => [
            ...u,
            { key, name: file.name, progress: 0, status: "uploading" },
          ]);
          try {
            const contentType = file.type || "application/octet-stream";
            const { item, upload_url } = await filesApi.requestUploadUrl(
              token,
              file.name,
              parentId,
              contentType
            );
            // Straight to S3 — the bytes never pass through the API.
            await uploadToS3(upload_url, file, contentType, (fraction) =>
              setUploads((u) =>
                u.map((p) => (p.key === key ? { ...p, progress: fraction } : p))
              )
            );
            // Only now does the server confirm the object and record size.
            await filesApi.completeUpload(token, item.id);
            setUploads((u) =>
              u.map((p) => (p.key === key ? { ...p, progress: 1, status: "done" } : p))
            );
            notify("Upload complete", file.name);
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

      await reload();
      // Clear finished rows shortly after, leaving failures on screen.
      setTimeout(() => setUploads((u) => u.filter((p) => p.status === "error")), 2500);
    },
    [token, current.id, reload]
  );

  const dismissUpload = useCallback(
    (key: string) => setUploads((u) => u.filter((p) => p.key !== key)),
    []
  );

  return {
    // view
    view,
    setView,
    query,
    setQuery,
    sort,
    setSort,
    // data
    items,
    total,
    hasMore,
    usage,
    loading,
    loadingMore,
    error,
    loadMore,
    reload,
    // navigation
    trail,
    current,
    openFolder,
    navigateTo,
    // selection
    selected,
    selectedItems,
    toggleSelected,
    selectAll,
    clearSelection,
    // mutations
    createFolder,
    rename,
    setColor,
    toggleStarred,
    moveTo,
    trashItems,
    restoreItems,
    deleteForever,
    download,
    upload,
    uploads,
    dismissUpload,
  };
}
