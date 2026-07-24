"use client";

/**
 * OAuth return page.
 *
 * The provider redirects here with `?code=…&state=…`. This validates the
 * state, hands the code to the backend to exchange, and on success lands
 * on the dashboard. It renders nothing meaningful — it exists only to run
 * the exchange and move the user on.
 *
 * Runs once, guarded by a ref: React 18 Strict Mode mounts effects twice
 * in dev, and an OAuth code is single-use, so a second exchange would
 * always fail.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { useAuth, errorMessage } from "@/lib/auth-context";
import { readOAuthCallback } from "@/lib/oauth";

export default function OAuthCallbackPage() {
  const { completeOAuth } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    let cancelled = false;
    (async () => {
      try {
        const { provider, code, redirectUri } = readOAuthCallback(window.location.search);
        await completeOAuth(provider, code, redirectUri);
        if (!cancelled) router.replace("/dashboard");
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [completeOAuth, router]);

  return (
    <div className="auth-card" style={{ textAlign: "center" }}>
      {error ? (
        <>
          <h1 style={{ fontSize: 22, marginBottom: 10 }}>Sign-in failed</h1>
          <p style={{ color: "var(--text-med)", fontSize: 15, marginBottom: 24 }}>{error}</p>
          <Link href="/auth/login" className="btn-primary" style={{ display: "inline-flex" }}>
            Back to sign in
          </Link>
        </>
      ) : (
        <p style={{ color: "var(--text-med)", fontSize: 15 }}>Signing you in…</p>
      )}
    </div>
  );
}
