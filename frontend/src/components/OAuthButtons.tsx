"use client";

import { useState } from "react";

import { GithubIcon } from "@/components/GithubIcon";
import { OAuthProvider, anyOAuthEnabled, oauthEnabled, startOAuth } from "@/lib/oauth";

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

/**
 * Google/GitHub sign-in buttons. Each renders only when that provider is
 * configured (its NEXT_PUBLIC client id is set at build time), so an
 * unconfigured provider never shows a button that would fail — and if
 * neither is configured, the whole block (divider included) is omitted,
 * leaving the password form clean.
 *
 * `verb` is "Sign in" / "Sign up" so the same component reads correctly
 * on both the login and register pages; the underlying OAuth flow is
 * identical either way (it finds-or-creates the account).
 */
export function OAuthButtons({ verb }: { verb: "Sign in" | "Sign up" }) {
  const [error, setError] = useState<string | null>(null);

  if (!anyOAuthEnabled()) return null;

  const go = (provider: OAuthProvider) => {
    try {
      startOAuth(provider);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start sign-in.");
    }
  };

  return (
    <>
      <div className="auth-divider">or continue with</div>

      {error && (
        <p role="alert" style={{ color: "var(--error)", fontSize: 13, marginBottom: 12, textAlign: "center" }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {oauthEnabled("google") && (
          <button type="button" className="btn-oauth" onClick={() => go("google")}>
            <GoogleIcon />
            {verb} with Google
          </button>
        )}
        {oauthEnabled("github") && (
          <button type="button" className="btn-oauth" onClick={() => go("github")}>
            <GithubIcon size={20} />
            {verb} with GitHub
          </button>
        )}
      </div>
    </>
  );
}
