"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * /auth is a leftover from the mockup era. It used to render its own
 * combined sign-in/sign-up form whose submit handler was literally
 * `router.push('/dashboard')` with a "Simulate auth" comment — it
 * accepted any credentials and authenticated nobody.
 *
 * The real forms live at /auth/login and /auth/register, so this now
 * just forwards there rather than presenting a second, fake one.
 *
 * Redirect is client-side because the app is a static export: there is
 * no server to issue a 302.
 */
export default function AuthIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/auth/login");
  }, [router]);

  return (
    <div className="auth-card" style={{ textAlign: "center" }}>
      <p style={{ color: "var(--text-med)", fontSize: 15 }}>Taking you to sign in…</p>
      <Link
        href="/auth/login"
        className="btn-primary"
        style={{ marginTop: 20, display: "inline-flex" }}
      >
        Continue
      </Link>
    </div>
  );
}
