"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Cloud,
  ExternalLink,
  HardDrive,
  Key,
  Monitor,
  Sliders,
  User as UserIcon,
} from "lucide-react";

import { useAuth, errorMessage } from "@/lib/auth-context";
import { LoginActivity, Session, auth as authApi } from "@/lib/api";
import { FormError } from "@/components/FormError";
import { formatBytes, formatRelativeDate } from "@/lib/format";
import { useTranslation } from "@/lib/i18n";
import {
  ThemePreference,
  applyTheme,
  getDefaultView,
  getReducedMotionOverride,
  getTheme,
  setDefaultView,
  setReducedMotionOverride,
  setTheme,
} from "@/lib/preferences";
import type { View } from "@/lib/use-files";

type Tab = "profile" | "storage" | "security" | "preferences" | "about";

const TABS: { key: Tab; i18nKey: string; icon: React.ReactNode }[] = [
  { key: "profile", i18nKey: "settings.tab.profile", icon: <UserIcon size={16} /> },
  { key: "storage", i18nKey: "settings.tab.storage", icon: <HardDrive size={16} /> },
  { key: "security", i18nKey: "settings.tab.security", icon: <Key size={16} /> },
  { key: "preferences", i18nKey: "settings.tab.preferences", icon: <Sliders size={16} /> },
  { key: "about", i18nKey: "settings.tab.about", icon: <Cloud size={16} /> },
];

const VALID_TABS: Tab[] = ["profile", "storage", "security", "preferences", "about"];

export default function SettingsPage() {
  const { t } = useTranslation();
  // Honour ?tab=… so deep links (e.g. the storage banner's "Settings"
  // button) land on the right section. Read once, lazily, to avoid
  // touching window during the static-export SSR pass.
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "profile";
    const requested = new URLSearchParams(window.location.search).get("tab");
    return (VALID_TABS as string[]).includes(requested ?? "") ? (requested as Tab) : "profile";
  });

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface-app, var(--surface-1))" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px clamp(16px, 4vw, 40px)",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <Link
          href="/dashboard"
          className="btn-secondary"
          style={{ textDecoration: "none" }}
        >
          <ArrowLeft size={16} />
          <span className="btn-label">{t("settings.back")}</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Cloud size={20} color="var(--primary)" strokeWidth={2.5} />
          <span style={{ fontWeight: 700, fontSize: "16px" }}>{t("settings.title")}</span>
        </div>
        <span style={{ width: 0 }} />
      </header>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "32px clamp(16px, 4vw, 40px)" }}>
        <nav
          style={{
            display: "flex",
            gap: "4px",
            marginBottom: "28px",
            borderBottom: "1px solid var(--hairline)",
            overflowX: "auto",
          }}
        >
          {TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                background: "transparent",
                border: "none",
                borderBottom:
                  tab === entry.key ? "2px solid var(--primary)" : "2px solid transparent",
                color: tab === entry.key ? "var(--text-high)" : "var(--text-med)",
                fontWeight: tab === entry.key ? 600 : 500,
                fontSize: "14px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {entry.icon}
              {t(entry.i18nKey)}
            </button>
          ))}
        </nav>

        {tab === "profile" && <ProfileTab />}
        {tab === "storage" && <StorageTab />}
        {tab === "security" && (
          <>
            <SecurityTab />
            <SessionsCard />
            <LoginActivityCard />
            <SignOutEverywhereCard />
          </>
        )}
        {tab === "preferences" && <PreferencesTab />}
        {tab === "about" && <AboutTab />}
      </div>
    </div>
  );
}

function ProfileTab() {
  const { user, token, setUser } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!user || !token) return null;

  const dirty = fullName.trim() !== user.full_name;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const updated = await authApi.updateProfile(token, { full_name: fullName.trim() });
      setUser(updated);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Profile</h2>
      <p style={{ fontSize: 13, color: "var(--text-med)", marginBottom: 20 }}>
        Your name and connected sign-in methods.
      </p>

      <form onSubmit={handleSave}>
        <FormError message={error} />
        {saved && !error && (
          <p style={{ fontSize: 13, color: "var(--success, #4ade80)", marginBottom: 16 }}>
            Saved.
          </p>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="full_name">
            Full name
          </label>
          <input
            id="full_name"
            type="text"
            className="form-input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            minLength={1}
            maxLength={100}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Email</label>
          <input
            type="email"
            className="form-input"
            value={user.email}
            disabled
            style={{ opacity: 0.6, cursor: "not-allowed" }}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Connected sign-in methods</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(user.providers ?? []).length > 0 ? (
              (user.providers ?? []).map((p) => (
                <span key={p} className="badge" style={{ textTransform: "capitalize" }}>
                  {p}
                </span>
              ))
            ) : (
              <span className="badge">Password</span>
            )}
          </div>
        </div>

        <button type="submit" className="btn-primary" disabled={!dirty || submitting}>
          {submitting ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}

function StorageTab() {
  const { user, token, setUser } = useAuth();
  const quotaGb = (user?.storage_quota_bytes ?? 100 * 1024 ** 3) / 1024 ** 3;
  const [gb, setGb] = useState(String(Math.round(quotaGb * 100) / 100));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!user || !token) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const parsed = Number(gb);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1024 ** 2) {
      setError("Enter a value between 1 GB and 1,048,576 GB (1 PB).");
      return;
    }
    setSubmitting(true);
    try {
      const updated = await authApi.updateProfile(token, {
        storage_quota_bytes: Math.round(parsed * 1024 ** 3),
      });
      setUser(updated);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Storage</h2>
      <p style={{ fontSize: 13, color: "var(--text-med)", marginBottom: 20 }}>
        This sets the denominator shown on your dashboard&apos;s storage bar (e.g.
        &ldquo;{formatBytes(user.storage_quota_bytes)} used of&hellip;&rdquo;). It is a
        personal display preference only — S3 has no real quota and bills for exactly
        what you store, regardless of this number.
      </p>

      <form onSubmit={handleSave}>
        <FormError message={error} />
        {saved && !error && (
          <p style={{ fontSize: 13, color: "var(--success, #4ade80)", marginBottom: 16 }}>
            Saved.
          </p>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="quota_gb">
            Displayed capacity (GB)
          </label>
          <input
            id="quota_gb"
            type="number"
            className="form-input"
            value={gb}
            onChange={(e) => setGb(e.target.value)}
            min={1}
            max={1024 ** 2}
            step="any"
            required
          />
        </div>

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}

function SecurityTab() {
  const { user, token } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!user || !token) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await authApi.changePassword(
        token,
        user.has_password ? currentPassword : null,
        newPassword
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>
        {user.has_password ? "Change password" : "Set a password"}
      </h2>
      <p style={{ fontSize: 13, color: "var(--text-med)", marginBottom: 20 }}>
        {user.has_password
          ? "You'll need your current password to set a new one."
          : "Your account currently only signs in via " +
            (user.providers ?? []).join(" and ") +
            ". Set a password to also allow signing in directly with your email."}
      </p>

      <form onSubmit={handleSave}>
        <FormError message={error} />
        {saved && !error && (
          <p style={{ fontSize: 13, color: "var(--success, #4ade80)", marginBottom: 16 }}>
            Password updated.
          </p>
        )}

        {user.has_password && (
          <div className="form-group">
            <label className="form-label" htmlFor="current_password">
              Current password
            </label>
            <input
              id="current_password"
              type="password"
              className="form-input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="new_password">
            New password
          </label>
          <input
            id="new_password"
            type="password"
            className="form-input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            maxLength={72}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="confirm_password">
            Confirm new password
          </label>
          <input
            id="confirm_password"
            type="password"
            className="form-input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={8}
            maxLength={72}
            required
          />
        </div>

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Saving…" : user.has_password ? "Change password" : "Set password"}
        </button>
      </form>
    </div>
  );
}

function SignOutEverywhereCard() {
  const { token, logout } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!token) return null;

  const handleSignOutEverywhere = async () => {
    if (!window.confirm("Sign out of Nimbus on every device? You'll need to sign in again here too.")) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await authApi.signOutEverywhere(token);
      // Ends this browser's session too, since "everywhere" should mean
      // everywhere — the server side is already revoked at this point.
      await logout();
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ padding: 24, marginTop: 20 }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Sign out everywhere</h2>
      <p style={{ fontSize: 13, color: "var(--text-med)", marginBottom: 20 }}>
        Ends every signed-in session for this account, on every device — useful if you
        signed in somewhere you no longer trust.
      </p>
      <FormError message={error} />
      <button
        type="button"
        className="btn-secondary"
        style={{ color: "var(--error)" }}
        onClick={() => void handleSignOutEverywhere()}
        disabled={submitting}
      >
        {submitting ? "Signing out…" : "Sign out everywhere"}
      </button>
    </div>
  );
}

function shortenUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  // Just enough to recognise a device without parsing the whole string.
  const browser =
    /Edg/.test(ua) ? "Edge" :
    /Chrome/.test(ua) ? "Chrome" :
    /Firefox/.test(ua) ? "Firefox" :
    /Safari/.test(ua) ? "Safari" :
    "Browser";
  const os =
    /Windows/.test(ua) ? "Windows" :
    /Mac OS/.test(ua) ? "macOS" :
    /Android/.test(ua) ? "Android" :
    /iPhone|iPad/.test(ua) ? "iOS" :
    /Linux/.test(ua) ? "Linux" :
    "";
  return os ? `${browser} on ${os}` : browser;
}

function SessionsCard() {
  const { token } = useAuth();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = () => {
    if (!token) return;
    authApi
      .sessions(token)
      .then(({ sessions: s }) => setSessions(s))
      .catch(() => setSessions([]));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleRevoke = async (session: Session) => {
    if (!token) return;
    setBusy(session.id);
    try {
      await authApi.revokeSession(token, session.id);
      reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card" style={{ padding: 24, marginTop: 20 }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Active sessions</h2>
      <p style={{ fontSize: 13, color: "var(--text-med)", marginBottom: 20 }}>
        Devices currently signed in to this account. Sign out any you don&apos;t recognise.
      </p>
      {sessions === null ? (
        <p style={{ fontSize: 13, color: "var(--text-med)" }}>Loading…</p>
      ) : sessions.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-med)" }}>No active sessions.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sessions.map((session) => (
            <div
              key={session.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                border: "1px solid var(--hairline)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <Monitor size={16} color="var(--text-med)" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600 }}>
                  {shortenUserAgent(session.user_agent)}
                  {session.current && (
                    <span style={{ fontWeight: 400, color: "var(--primary)" }}> · This device</span>
                  )}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-med)" }}>
                  {session.ip ?? "unknown IP"} · active {formatRelativeDate(session.last_active)}
                </p>
              </div>
              {!session.current && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void handleRevoke(session)}
                  disabled={busy === session.id}
                  style={{ color: "var(--error)", flexShrink: 0 }}
                >
                  {busy === session.id ? "Signing out…" : "Sign out"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LoginActivityCard() {
  const { token } = useAuth();
  const [logins, setLogins] = useState<LoginActivity[] | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    authApi
      .loginActivity(token)
      .then(({ logins: l }) => active && setLogins(l))
      .catch(() => active && setLogins([]));
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="card" style={{ padding: 24, marginTop: 20 }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Recent sign-ins</h2>
      <p style={{ fontSize: 13, color: "var(--text-med)", marginBottom: 20 }}>
        The last few times this account signed in. If you see one you don&apos;t recognise,
        change your password and sign out everywhere.
      </p>
      {logins === null ? (
        <p style={{ fontSize: 13, color: "var(--text-med)" }}>Loading…</p>
      ) : logins.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-med)" }}>No recent sign-ins recorded.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {logins.map((login) => (
            <div
              key={login.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                border: "1px solid var(--hairline)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <Monitor size={16} color="var(--text-med)" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600 }}>
                  {shortenUserAgent(login.user_agent)}
                  <span style={{ fontWeight: 400, color: "var(--text-low)" }}>
                    {" "}· via {login.method}
                  </span>
                </p>
                <p style={{ fontSize: 12, color: "var(--text-med)" }}>
                  {login.ip ?? "unknown IP"} · {formatRelativeDate(login.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PreferencesTab() {
  const { t, locale, setLocale } = useTranslation();
  const [defaultView, setDefaultViewState] = useState<View>(() => getDefaultView());
  const [reducedMotion, setReducedMotionState] = useState(() => getReducedMotionOverride());
  const [theme, setThemeState] = useState<ThemePreference>(() => getTheme());

  const handleDefaultView = (view: View) => {
    setDefaultViewState(view);
    setDefaultView(view);
  };

  const handleReducedMotion = (enabled: boolean) => {
    setReducedMotionState(enabled);
    setReducedMotionOverride(enabled);
    document.documentElement.dataset.reducedMotion = enabled ? "true" : "false";
  };

  const handleTheme = (next: ThemePreference) => {
    setThemeState(next);
    setTheme(next);
    applyTheme(next);
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>{t("settings.tab.preferences")}</h2>
      <p style={{ fontSize: 13, color: "var(--text-med)", marginBottom: 20 }}>
        Stored in this browser only — these don&apos;t follow you to another device.
      </p>

      <div className="form-group">
        <label className="form-label" htmlFor="theme">
          {t("prefs.theme")}
        </label>
        <select
          id="theme"
          className="form-input"
          value={theme}
          onChange={(e) => handleTheme(e.target.value as ThemePreference)}
          style={{ cursor: "pointer" }}
        >
          <option value="system">{t("prefs.theme.system")}</option>
          <option value="light">{t("prefs.theme.light")}</option>
          <option value="dark">{t("prefs.theme.dark")}</option>
        </select>
        <p style={{ fontSize: 12, color: "var(--text-low)", marginTop: 6 }}>
          {t("prefs.theme.help")}
        </p>
      </div>

      <div className="form-group" style={{ marginTop: 20 }}>
        <label className="form-label" htmlFor="language">
          {t("prefs.language")}
        </label>
        <select
          id="language"
          className="form-input"
          value={locale}
          onChange={(e) => setLocale(e.target.value as "en" | "hi")}
          style={{ cursor: "pointer" }}
        >
          <option value="en">{t("prefs.language.en")}</option>
          <option value="hi">{t("prefs.language.hi")}</option>
        </select>
        <p style={{ fontSize: 12, color: "var(--text-low)", marginTop: 6 }}>
          {t("prefs.language.help")}
        </p>
      </div>

      <div className="form-group" style={{ marginTop: 20 }}>
        <label className="form-label" htmlFor="default_view">
          Default view on sign-in
        </label>
        <select
          id="default_view"
          className="form-input"
          value={defaultView}
          onChange={(e) => handleDefaultView(e.target.value as View)}
          style={{ cursor: "pointer" }}
        >
          <option value="files">My Cloud</option>
          <option value="photos">Photos</option>
          <option value="videos">Videos</option>
          <option value="recent">Recent</option>
        </select>
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 14,
          cursor: "pointer",
          marginTop: 20,
        }}
      >
        <input
          type="checkbox"
          checked={reducedMotion}
          onChange={(e) => handleReducedMotion(e.target.checked)}
          style={{ accentColor: "var(--primary)", cursor: "pointer" }}
        />
        Reduce motion (overrides your system setting)
      </label>
    </div>
  );
}

function AboutTab() {
  return (
    <div className="card" style={{ padding: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>About Nimbus</h2>
      <p style={{ fontSize: 13, color: "var(--text-med)", marginBottom: 20 }}>
        Nimbus is a self-hosted, open-source alternative to Google Drive and
        Google Photos, running on your own AWS account.
      </p>

      <ul style={{ listStyle: "none", fontSize: 14, lineHeight: 2 }}>
        <li>
          <strong>License:</strong> Apache License 2.0
        </li>
        <li>
          <strong>Source:</strong>{" "}
          <a
            href="https://github.com/ankushkhakale/Nimbus"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--primary)", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <ExternalLink size={14} /> github.com/ankushkhakale/Nimbus
          </a>
        </li>
        <li>
          <strong>Stack:</strong> FastAPI + AWS Lambda, MongoDB Atlas, S3, Next.js
        </li>
      </ul>
    </div>
  );
}
