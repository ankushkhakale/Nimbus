"use client";

/**
 * Best-effort desktop notification. Silently does nothing if the browser
 * doesn't support the API, permission was denied, or scripting blocks it —
 * an upload finishing is never important enough to throw over.
 *
 * Critically: **Android Chrome forbids `new Notification()`** — it throws
 * `TypeError: Failed to construct 'Notification': Illegal constructor` and
 * demands `ServiceWorkerRegistration.showNotification()` instead (we don't
 * register a service worker, so there's simply no notification on Android).
 * That throw used to escape `notify()` and, because the "Upload complete"
 * call sits on the success path of an upload, it flipped every completed
 * upload to "error" on Android. Everything here is wrapped so a
 * notification failure can never bubble into its caller.
 */
export function notify(title: string, body?: string): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;

  const show = () => {
    try {
      new Notification(title, { body, icon: "/icon.svg" });
    } catch {
      /* Platforms that require a service worker (Android) just get no
         desktop notification — the in-app UI already shows the result. */
    }
  };

  try {
    if (Notification.permission === "granted") {
      show();
      return;
    }
    if (Notification.permission === "denied") return;

    void Notification.requestPermission()
      .then((permission) => {
        if (permission === "granted") show();
      })
      .catch(() => {
        /* older browsers reject the promise-less form — ignore */
      });
  } catch {
    /* reading Notification.permission or requesting it can itself throw in
       locked-down webviews; a notification is never worth surfacing that. */
  }
}
