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
  ItemType,
  Page,
  SortKey,
  UsageDetail,
  files as filesApi,
  uploadPartToS3,
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

export interface SearchFilters {
  type?: ItemType;
  category?: string;
  min_size?: number;
  max_size?: number;
  updated_after?: string;
  updated_before?: string;
}

const NO_FILTERS: SearchFilters = {};

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

// Files at or above this size go through multipart upload instead of a
// single PUT, so a mid-upload network hiccup only costs one part's
// worth of retrying rather than the whole file. 8MB comfortably clears
// S3's 5MB-per-part minimum.
const MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024;
const PART_SIZE_BYTES = 8 * 1024 * 1024;
// How many parts to have in flight at once — enough to use the
// connection well without opening so many requests that the browser or
// network starts queuing them anyway.
const PART_CONCURRENCY = 4;
const PART_MAX_ATTEMPTS = 3;

async function uploadPartWithRetry(
  url: string,
  blob: Blob,
  onProgress: (fraction: number) => void
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= PART_MAX_ATTEMPTS; attempt++) {
    try {
      return await uploadPartToS3(url, blob, onProgress);
    } catch (err) {
      lastError = err;
      if (attempt < PART_MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }
  throw lastError;
}

export function useFiles() {
  const { token } = useAuth();

  const [view, setViewRaw] = useState<View>(() => getDefaultView());
  const [trail, setTrail] = useState<Crumb[]>([ROOT]);
  const [sort, setSortRaw] = useState<SortKey>(() => getFolderSort(null) ?? "name");
  const [query, setQuery] = useState("");
  const [searchFilters, setSearchFilters] = useState<SearchFilters>(NO_FILTERS);

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
      if (query.trim()) return filesApi.search(token, query.trim(), { ...opts, ...searchFilters });

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
    [token, view, query, current.id, sort, searchFilters]
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

  const renameMany = useCallback(
    async (renames: { id: string; name: string }[]) => {
      if (!token || renames.length === 0) return;
      // Sequential rather than parallel: the server appends " (2)" on a
      // name collision, and processing in order keeps the numbering the
      // user previewed instead of racing.
      for (const r of renames) {
        await filesApi.update(token, r.id, { name: r.name });
      }
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

  // Shared by both the flat upload() and uploadFolder(): everything
  // about getting one File's bytes into one target folder, single-PUT
  // or multipart depending on size. Doesn't reload or touch uploads
  // beyond its own key's row — callers own that.
  const uploadOne = useCallback(
    async (file: File, parentId: string | null, key: string) => {
      if (!token) return;
      setUploads((u) => [...u, { key, name: file.name, progress: 0, status: "uploading" }]);
      const setProgress = (fraction: number) =>
        setUploads((u) => u.map((p) => (p.key === key ? { ...p, progress: fraction } : p)));

      try {
        const contentType = file.type || "application/octet-stream";

        if (file.size < MULTIPART_THRESHOLD_BYTES) {
          const { item, upload_url } = await filesApi.requestUploadUrl(
            token,
            file.name,
            parentId,
            contentType
          );
          // Straight to S3 — the bytes never pass through the API.
          await uploadToS3(upload_url, file, contentType, setProgress);
          // Only now does the server confirm the object and record size.
          await filesApi.completeUpload(token, item.id);
        } else {
          const partCount = Math.ceil(file.size / PART_SIZE_BYTES);
          const { item, upload_id, part_urls } = await filesApi.initiateMultipartUpload(
            token,
            file.name,
            parentId,
            contentType,
            partCount
          );

          const partFractions = new Array<number>(partCount).fill(0);
          const reportOverall = () =>
            setProgress(partFractions.reduce((sum, f) => sum + f, 0) / partCount);
          const parts: { part_number: number; etag: string }[] = new Array(partCount);

          try {
            let nextPart = 0;
            const worker = async () => {
              while (nextPart < partCount) {
                const i = nextPart++;
                const start = i * PART_SIZE_BYTES;
                const blob = file.slice(start, Math.min(start + PART_SIZE_BYTES, file.size));
                const etag = await uploadPartWithRetry(part_urls[i], blob, (fraction) => {
                  partFractions[i] = fraction;
                  reportOverall();
                });
                partFractions[i] = 1;
                reportOverall();
                parts[i] = { part_number: i + 1, etag };
              }
            };
            await Promise.all(
              Array.from({ length: Math.min(PART_CONCURRENCY, partCount) }, worker)
            );
            await filesApi.completeMultipartUpload(token, item.id, upload_id, parts);
          } catch (err) {
            await filesApi.abortMultipartUpload(token, item.id, upload_id).catch(() => {});
            throw err;
          }
        }

        setUploads((u) => u.map((p) => (p.key === key ? { ...p, progress: 1, status: "done" } : p)));
        notify("Upload complete", file.name);
      } catch (err) {
        setUploads((u) =>
          u.map((p) =>
            p.key === key
              ? { ...p, status: "error", error: err instanceof Error ? err.message : "Upload failed" }
              : p
          )
        );
      }
    },
    [token]
  );

  const upload = useCallback(
    async (fileList: FileList | File[]) => {
      if (!token) return;
      const chosen = Array.from(fileList);
      const parentId = current.id;

      await Promise.all(
        chosen.map((file, index) => uploadOne(file, parentId, `${index}-${file.name}-${file.size}`))
      );

      await reload();
      // Clear finished rows shortly after, leaving failures on screen.
      setTimeout(() => setUploads((u) => u.filter((p) => p.status === "error")), 2500);
    },
    [token, current.id, reload, uploadOne]
  );

  // entries: { path, file }[] where path is the file's position relative
  // to the dropped/picked folder root, e.g. "Album/Sub/photo.jpg" — the
  // shape both the webkitdirectory input and the drag-and-drop entries
  // walk (see FileBrowser) produce. Recreates that structure as real
  // folders, memoized by path so uploading 200 photos in one subfolder
  // creates that subfolder exactly once.
  const uploadFolder = useCallback(
    async (entries: { path: string; file: File }[]) => {
      if (!token || entries.length === 0) return;
      const folderIds = new Map<string, string | null>([["", current.id]]);

      const resolveFolder = async (path: string): Promise<string | null> => {
        const cached = folderIds.get(path);
        if (cached !== undefined) return cached;
        const slash = path.lastIndexOf("/");
        const parentPath = slash === -1 ? "" : path.slice(0, slash);
        const name = slash === -1 ? path : path.slice(slash + 1);
        const parentId = await resolveFolder(parentPath);
        const folder = await filesApi.createFolder(token, name, parentId);
        folderIds.set(path, folder.id);
        return folder.id;
      };

      // Folder creation is sequential (each level depends on its
      // parent existing, and reusing the memo means later files in the
      // same subfolder don't re-create it) — cheap relative to the file
      // uploads themselves, which do run concurrently below.
      const targets: { file: File; parentId: string | null; key: string }[] = [];
      for (let index = 0; index < entries.length; index++) {
        const { path, file } = entries[index];
        const slash = path.lastIndexOf("/");
        const dirPath = slash === -1 ? "" : path.slice(0, slash);
        const parentId = await resolveFolder(dirPath);
        targets.push({ file, parentId, key: `${index}-${path}-${file.size}` });
      }

      await Promise.all(targets.map((t) => uploadOne(t.file, t.parentId, t.key)));

      await reload();
      setTimeout(() => setUploads((u) => u.filter((p) => p.status === "error")), 2500);
    },
    [token, current.id, reload, uploadOne]
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
    searchFilters,
    setSearchFilters,
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
    renameMany,
    setColor,
    toggleStarred,
    moveTo,
    trashItems,
    restoreItems,
    deleteForever,
    download,
    upload,
    uploadFolder,
    uploads,
    dismissUpload,
  };
}
