"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Cloud,
  ExternalLink,
  HardDrive,
  Key,
  User as UserIcon,
} from "lucide-react";

import { useAuth, errorMessage } from "@/lib/auth-context";
import { auth as authApi } from "@/lib/api";
import { FormError } from "@/components/FormError";
import { formatBytes } from "@/lib/format";

type Tab = "profile" | "storage" | "security" | "about";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "profile", label: "Profile", icon: <UserIcon size={16} /> },
  { key: "storage", label: "Storage", icon: <HardDrive size={16} /> },
  { key: "security", label: "Security", icon: <Key size={16} /> },
  { key: "about", label: "About", icon: <Cloud size={16} /> },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("profile");

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
          <span className="btn-label">Back to Nimbus</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Cloud size={20} color="var(--primary)" strokeWidth={2.5} />
          <span style={{ fontWeight: 700, fontSize: "16px" }}>Settings</span>
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
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                background: "transparent",
                border: "none",
                borderBottom: tab === t.key ? "2px solid var(--primary)" : "2px solid transparent",
                color: tab === t.key ? "var(--text-high)" : "var(--text-med)",
                fontWeight: tab === t.key ? 600 : 500,
                fontSize: "14px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "profile" && <ProfileTab />}
        {tab === "storage" && <StorageTab />}
        {tab === "security" && <SecurityTab />}
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
