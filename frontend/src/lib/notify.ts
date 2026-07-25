"use client";

/**
 * Best-effort desktop notification. Silently does nothing if the browser
 * doesn't support the API, permission was denied, or scripting blocks it
 * (some private-browsing modes) — an upload finishing is never important
 * enough to throw over.
 */
export function notify(title: string, body?: string): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;

  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "/icon.svg" });
    return;
  }
  if (Notification.permission === "denied") return;

  void Notification.requestPermission().then((permission) => {
    if (permission === "granted") new Notification(title, { body, icon: "/icon.svg" });
  });
}
