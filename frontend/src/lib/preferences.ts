"use client";

/**
 * Purely local, per-browser display preferences — never synced to the
 * server. Nothing here is a source of truth; losing it (a cleared
 * profile, a different browser) just falls back to a sane default.
 */

import type { SortKey } from "./api";
import type { SearchFilters, View } from "./use-files";

const DEFAULT_VIEW_KEY = "nimbus:default-view";
const REDUCED_MOTION_KEY = "nimbus:reduced-motion";
const SORT_PREFIX = "nimbus:sort:";
const VIEW_MODE_KEY = "nimbus:view-mode";
const SAVED_SEARCHES_KEY = "nimbus:saved-searches";
const STORAGE_BANNER_PREFIX = "nimbus:storage-banner-dismissed:";
const THEME_KEY = "nimbus:theme";
const LOCALE_KEY = "nimbus:locale";

export type ThemePreference = "system" | "light" | "dark";
export type Locale = "en" | "hi";

export interface SavedSearch {
  id: string;
  label: string;
  query: string;
  filters: SearchFilters;
}

const VALID_VIEWS: View[] = ["files", "photos", "videos", "starred", "recent", "trash"];

export type ViewMode = "list" | "grid";

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private-browsing modes can throw on access rather than just no-op.
    return null;
  }
}

function write(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage full or blocked — the preference just won't stick */
  }
}

export function getDefaultView(): View {
  const stored = read(DEFAULT_VIEW_KEY);
  return (VALID_VIEWS as string[]).includes(stored ?? "") ? (stored as View) : "files";
}

export function setDefaultView(view: View): void {
  write(DEFAULT_VIEW_KEY, view);
}

/** Explicit in-app override; independent of the OS-level media query. */
export function getReducedMotionOverride(): boolean {
  return read(REDUCED_MOTION_KEY) === "1";
}

export function setReducedMotionOverride(enabled: boolean): void {
  write(REDUCED_MOTION_KEY, enabled ? "1" : "0");
}

export function getFolderSort(folderId: string | null): SortKey | null {
  const stored = read(SORT_PREFIX + (folderId ?? "root"));
  return stored as SortKey | null;
}

export function setFolderSort(folderId: string | null, sort: SortKey): void {
  write(SORT_PREFIX + (folderId ?? "root"), sort);
}

export function getViewMode(): ViewMode {
  return read(VIEW_MODE_KEY) === "grid" ? "grid" : "list";
}

export function setViewMode(mode: ViewMode): void {
  write(VIEW_MODE_KEY, mode);
}

export function getSavedSearches(): SavedSearch[] {
  const stored = read(SAVED_SEARCHES_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addSavedSearch(search: Omit<SavedSearch, "id">): SavedSearch {
  const withId: SavedSearch = { ...search, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
  const next = [...getSavedSearches(), withId];
  write(SAVED_SEARCHES_KEY, JSON.stringify(next));
  return withId;
}

export function removeSavedSearch(id: string): void {
  write(SAVED_SEARCHES_KEY, JSON.stringify(getSavedSearches().filter((s) => s.id !== id)));
}

// Dismissal is keyed by severity tier ("warning" / "critical") so that
// dismissing the gentler banner doesn't also suppress the urgent one if
// usage keeps climbing.
export function isStorageBannerDismissed(level: string): boolean {
  return read(STORAGE_BANNER_PREFIX + level) === "1";
}

export function dismissStorageBanner(level: string): void {
  write(STORAGE_BANNER_PREFIX + level, "1");
}

// --- theme ---

export function getTheme(): ThemePreference {
  const stored = read(THEME_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

export function setTheme(theme: ThemePreference): void {
  write(THEME_KEY, theme);
}

/** Resolve "system" against the OS preference and stamp the concrete
 * theme onto <html> so the CSS variables switch. Safe to call anytime. */
export function applyTheme(theme: ThemePreference): void {
  if (typeof window === "undefined") return;
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : theme;
  document.documentElement.dataset.theme = resolved;
}

// --- locale ---

export function getLocale(): Locale {
  return read(LOCALE_KEY) === "hi" ? "hi" : "en";
}

export function setLocale(locale: Locale): void {
  write(LOCALE_KEY, locale);
}
