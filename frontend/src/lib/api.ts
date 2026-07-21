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
  options: { method?: string; body?: unknown; token?: string | null } = {}
): Promise<T> {
  const { method = "GET", body, token } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch only rejects on network-level failure, never on 4xx/5xx.
    throw new ApiError(0, "Could not reach the server. Check your connection.");
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
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export type ItemType = "file" | "folder";
export type UploadStatus = "pending" | "ready";

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  parent_id: string | null;
  size: number | null;
  content_type: string | null;
  status: UploadStatus | null;
  taken_at: string | null;
  created_at: string;
  updated_at: string;
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

// --- auth ----------------------------------------------------------------

export const auth = {
  register: (email: string, full_name: string, password: string) =>
    request<User>("/auth/register", { method: "POST", body: { email, full_name, password } }),

  login: (email: string, password: string) =>
    request<TokenResponse>("/auth/login", { method: "POST", body: { email, password } }),

  me: (token: string) => request<User>("/auth/me", { token }),

  forgotPassword: (email: string) =>
    request<{ message: string }>("/auth/forgot-password", { method: "POST", body: { email } }),
};

// --- files ---------------------------------------------------------------

export const files = {
  usage: (token: string) => request<Usage>("/files/usage", { token }),

  list: (token: string, parentId?: string | null) =>
    request<Item[]>(`/files${parentId ? `?parent_id=${encodeURIComponent(parentId)}` : ""}`, {
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

  update: (token: string, itemId: string, changes: { name?: string; parent_id?: string | null }) =>
    request<Item>(`/files/${itemId}`, { method: "PATCH", body: changes, token }),

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
export async function uploadToS3(
  uploadUrl: string,
  file: File,
  contentType: string | null
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: contentType ? { "Content-Type": contentType } : {},
    body: file,
  });
  if (!response.ok) {
    throw new ApiError(response.status, `Upload failed (${response.status}).`);
  }
}
