/**
 * Typed client for the Nimbus API.
 *
 * The base URL comes from NEXT_PUBLIC_API_BASE_URL so the same build can
 * point at a local backend or the deployed API Gateway.
 */

const BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(
  /\/$/,
  ""
);

const API = `${BASE_URL}/api/v1`;

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** FastAPI returns `detail` as a string, or as a list for 422s. */
function extractDetail(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const first = detail[0];
      if (first && typeof first === "object" && "msg" in first) {
        return String((first as { msg: unknown }).msg);
      }
    }
  }
  return fallback;
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string | null;
    /** Send the refresh cookie. Only /auth/refresh and /auth/logout need it. */
    withCookies?: boolean;
  } = {}
): Promise<T> {
  const { method = "GET", body, token, withCookies = false } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers,
      // Deliberately opt-in rather than global: sending the cookie on
      // every file request would attach a long-lived credential to
      // hundreds of calls that have no use for it.
      credentials: withCookies ? "include" : "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch only rejects on network-level failure, never on 4xx/5xx. This
    // covers several distinct causes (DNS, TLS, CORS, an actually-dead
    // connection) that all look identical to JavaScript, so the message
    // only claims what navigator.onLine can actually confirm.
    throw new ApiError(
      0,
      navigator.onLine
        ? "Could not reach the server. It may be temporarily down, or a network in between is blocking the request."
        : "You appear to be offline. Check your connection and try again."
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    throw new ApiError(response.status, extractDetail(parsed, response.statusText));
  }
  return parsed as T;
}

// --- types ---------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  full_name: string;
  providers: string[];
  has_password: boolean;
  /** Display-only denominator for the storage widget. Not enforced. */
  storage_quota_bytes: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export type ItemType = "file" | "folder";
export type UploadStatus = "pending" | "ready";

/** Fixed palette — must match ALLOWED_ITEM_COLORS in the backend schema. */
export type ItemColor = "yellow" | "blue" | "green" | "red" | "purple" | "pink" | "gray";

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  parent_id: string | null;
  size: number | null;
  content_type: string | null;
  status: UploadStatus | null;
  taken_at: string | null;
  starred: boolean;
  color: ItemColor | null;
  created_at: string;
  updated_at: string;
  /** Set when the item is in the trash. */
  deleted_at: string | null;
}

export interface UploadUrlResponse {
  item: Item;
  upload_url: string;
  expires_in: number;
}

export interface Usage {
  bytes_stored: number;
  file_count: number;
  folder_count: number;
}

export interface CategoryUsage {
  category: string;
  bytes_stored: number;
  file_count: number;
}

export interface UsageDetail extends Usage {
  trashed_count: number;
  trashed_bytes: number;
  by_category: CategoryUsage[];
}

/** A page of items. `total` is what lets infinite scroll know when to stop. */
export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

export type SortKey =
  | "name"
  | "name_desc"
  | "size"
  | "size_asc"
  | "updated"
  | "updated_asc";

export interface SignedUrl {
  item_id: string;
  url: string;
  is_thumbnail: boolean;
}

// --- auth ----------------------------------------------------------------

export const auth = {
  register: (email: string, full_name: string, password: string) =>
    request<User>("/auth/register", { method: "POST", body: { email, full_name, password } }),

  // withCookies so the browser stores the httpOnly refresh cookie the
  // server sets here; without it the response's Set-Cookie is dropped.
  login: (email: string, password: string) =>
    request<TokenResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
      withCookies: true,
    }),

  /**
   * Exchange the refresh cookie for a new access token.
   *
   * This is what makes a reload survivable: the access token lives in
   * memory only, so on load the app has nothing until this succeeds.
   */
  refresh: () =>
    request<TokenResponse>("/auth/refresh", { method: "POST", withCookies: true }),

  /** Revokes the session server-side, not just in this browser. */
  logout: () => request<void>("/auth/logout", { method: "POST", withCookies: true }),

  /**
   * Complete an OAuth sign-in by handing the provider's one-time code to
   * the backend, which exchanges it (with the client secret) and returns
   * a session — same shape as password login, including the refresh
   * cookie, so withCookies is required.
   */
  oauthCallback: (provider: string, code: string, redirect_uri: string) =>
    request<TokenResponse>(`/auth/oauth/${provider}/callback`, {
      method: "POST",
      body: { code, redirect_uri },
      withCookies: true,
    }),

  me: (token: string) => request<User>("/auth/me", { token }),

  updateProfile: (
    token: string,
    changes: { full_name?: string; storage_quota_bytes?: number }
  ) => request<User>("/auth/me", { method: "PATCH", body: changes, token }),

  changePassword: (token: string, current_password: string | null, new_password: string) =>
    request<void>("/auth/me/change-password", {
      method: "POST",
      body: { current_password, new_password },
      token,
    }),

  forgotPassword: (email: string) =>
    request<{ message: string }>("/auth/forgot-password", { method: "POST", body: { email } }),

  /** Revokes every refresh token for this account — every device, not
   * just this browser. The caller's own access token still lives until
   * it naturally expires (it's a stateless JWT), so the caller should
   * also call `logout()` locally right after this succeeds. */
  signOutEverywhere: (token: string) =>
    request<void>("/auth/me/sign-out-everywhere", { method: "POST", token }),
};

// --- files ---------------------------------------------------------------

function qs(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export const files = {
  usage: (token: string) => request<Usage>("/files/usage", { token }),

  usageDetail: (token: string) => request<UsageDetail>("/files/usage/detail", { token }),

  list: (
    token: string,
    parentId?: string | null,
    opts: { offset?: number; limit?: number; sort?: SortKey } = {}
  ) =>
    request<Page<Item>>(
      `/files${qs({ parent_id: parentId, offset: opts.offset, limit: opts.limit, sort: opts.sort })}`,
      { token }
    ),

  /** Every image the user owns, newest first, regardless of folder. */
  photos: (token: string, opts: { offset?: number; limit?: number } = {}) =>
    request<Page<Item>>(`/files/photos${qs({ offset: opts.offset, limit: opts.limit })}`, {
      token,
    }),

  /** Every video the user owns, newest first, regardless of folder. */
  videos: (token: string, opts: { offset?: number; limit?: number } = {}) =>
    request<Page<Item>>(`/files/videos${qs({ offset: opts.offset, limit: opts.limit })}`, {
      token,
    }),

  search: (
    token: string,
    q: string,
    opts: {
      offset?: number;
      limit?: number;
      type?: ItemType;
      category?: string;
      min_size?: number;
      max_size?: number;
      updated_after?: string;
      updated_before?: string;
    } = {}
  ) =>
    request<Page<Item>>(
      `/files/search${qs({
        q,
        offset: opts.offset,
        limit: opts.limit,
        type: opts.type,
        category: opts.category,
        min_size: opts.min_size,
        max_size: opts.max_size,
        updated_after: opts.updated_after,
        updated_before: opts.updated_before,
      })}`,
      { token }
    ),

  recent: (token: string, limit = 20) =>
    request<Item[]>(`/files/recent${qs({ limit })}`, { token }),

  /** Photos taken on today's month and day in a previous year. */
  onThisDay: (token: string) => request<Item[]>("/files/on-this-day", { token }),

  /** Every starred item, file or folder, regardless of where it lives. */
  starred: (token: string, opts: { offset?: number; limit?: number } = {}) =>
    request<Page<Item>>(`/files/starred${qs({ offset: opts.offset, limit: opts.limit })}`, {
      token,
    }),

  star: (token: string, itemIds: string[]) =>
    request<{ affected: number }>("/files/star", {
      method: "POST",
      body: { item_ids: itemIds },
      token,
    }),

  unstar: (token: string, itemIds: string[]) =>
    request<{ affected: number }>("/files/unstar", {
      method: "POST",
      body: { item_ids: itemIds },
      token,
    }),

  /** Groups of images with near-identical perceptual hashes. Read-only —
   * nothing is deleted automatically. */
  duplicates: (token: string) =>
    request<{ groups: { items: Item[] }[] }>("/files/duplicates", { token }),

  /** Groups of visually-similar images taken close together in time. */
  photoStacks: (token: string) =>
    request<{ groups: { items: Item[] }[] }>("/files/photo-stacks", { token }),

  /** Every geotagged photo, for the map view. Most photos have no GPS
   * EXIF and are simply absent from the result. */
  mapPoints: (token: string) =>
    request<{ photos: { item: Item; lat: number; lon: number }[] }>("/files/map-points", {
      token,
    }),

  trash: (token: string, opts: { offset?: number; limit?: number } = {}) =>
    request<Page<Item>>(`/files/trash${qs({ offset: opts.offset, limit: opts.limit })}`, {
      token,
    }),

  /**
   * Sign a whole screen of thumbnails in one request. Asking per tile
   * meant one Lambda invocation per photo.
   */
  thumbnailUrls: (token: string, itemIds: string[]) =>
    request<{ urls: SignedUrl[]; expires_in: number }>("/files/thumbnail-urls", {
      method: "POST",
      body: { item_ids: itemIds },
      token,
    }),

  previewUrl: (token: string, itemId: string) =>
    request<{ download_url: string; expires_in: number }>(`/files/${itemId}/preview-url`, {
      token,
    }),

  moveMany: (token: string, itemIds: string[], parentId: string | null) =>
    request<{ affected: number }>("/files/move", {
      method: "POST",
      body: { item_ids: itemIds, parent_id: parentId },
      token,
    }),

  trashMany: (token: string, itemIds: string[]) =>
    request<{ affected: number }>("/files/trash", {
      method: "POST",
      body: { item_ids: itemIds },
      token,
    }),

  restoreMany: (token: string, itemIds: string[]) =>
    request<{ affected: number }>("/files/restore", {
      method: "POST",
      body: { item_ids: itemIds },
      token,
    }),

  deleteForever: (token: string, itemIds: string[]) =>
    request<{ affected: number }>("/files/delete-permanently", {
      method: "POST",
      body: { item_ids: itemIds },
      token,
    }),

  createFolder: (token: string, name: string, parent_id: string | null = null) =>
    request<Item>("/files/folders", { method: "POST", body: { name, parent_id }, token }),

  requestUploadUrl: (
    token: string,
    name: string,
    parent_id: string | null = null,
    content_type: string | null = null
  ) =>
    request<UploadUrlResponse>("/files/upload-url", {
      method: "POST",
      body: { name, parent_id, content_type },
      token,
    }),

  completeUpload: (token: string, itemId: string) =>
    request<Item>(`/files/${itemId}/complete`, { method: "POST", token }),

  downloadUrl: (token: string, itemId: string) =>
    request<{ download_url: string; expires_in: number }>(`/files/${itemId}/download-url`, {
      token,
    }),

  /**
   * Thumbnail URL for an image. Falls back to the original when no
   * thumbnail exists yet — generation is asynchronous, so a freshly
   * uploaded photo has none for a second or two.
   */
  thumbnailUrl: (token: string, itemId: string) =>
    request<{ url: string; is_thumbnail: boolean; expires_in: number }>(
      `/files/${itemId}/thumbnail-url`,
      { token }
    ),

  update: (
    token: string,
    itemId: string,
    changes: { name?: string; parent_id?: string | null; color?: ItemColor | null }
  ) => request<Item>(`/files/${itemId}`, { method: "PATCH", body: changes, token }),

  remove: (token: string, itemId: string) =>
    request<void>(`/files/${itemId}`, { method: "DELETE", token }),
};

/**
 * Upload bytes straight to S3 with a presigned URL.
 *
 * Deliberately not routed through `request`: this goes to S3, not the
 * API, and must not carry the Authorization header — S3 rejects requests
 * that carry both its signature and an unexpected auth header.
 */
export function uploadToS3(
  uploadUrl: string,
  file: File,
  contentType: string | null,
  onProgress?: (fraction: number) => void
): Promise<void> {
  // XMLHttpRequest rather than fetch: fetch cannot report upload progress
  // in any browser today (ReadableStream request bodies are still not
  // universally supported), and a multi-gigabyte upload with no progress
  // bar is indistinguishable from a hang.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    };

    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError(xhr.status, `Upload failed (${xhr.status}).`));

    xhr.onerror = () =>
      reject(
        new ApiError(
          0,
          navigator.onLine
            ? "Upload failed partway through — the connection to S3 was interrupted. Try again."
            : "Upload failed — you appear to be offline."
        )
      );
    xhr.onabort = () => reject(new ApiError(0, "Upload cancelled."));

    xhr.send(file);
  });
}
