"use client";

/**
 * Create and manage share links for one item. A share is either public
 * (anyone with the link) or restricted to specific email addresses —
 * those recipients must be logged into a Nimbus account with a matching
 * address to open it (see ShareService.resolve on the backend).
 */

import { useEffect, useState } from "react";
import { Check, Copy, Globe, Loader2, Trash2, Users } from "lucide-react";

import { Item, Share, shares as sharesApi } from "@/lib/api";
import { formatRelativeDate } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";

const EXPIRY_OPTIONS: { label: string; days: number | null }[] = [
  { label: "Never", days: null },
  { label: "1 day", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "1 year", days: 365 },
];

function shareUrl(token: string): string {
  return `${window.location.origin}/share/?token=${token}`;
}

export function ShareDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const { token } = useAuth();
  const [existing, setExisting] = useState<Share[] | null>(null);
  const [recipients, setRecipients] = useState("");
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    sharesApi
      .listMine(token)
      .then(({ shares: all }) => {
        if (active) setExisting(all.filter((s) => s.item.id === item.id));
      })
      .catch(() => active && setExisting([]));
    return () => {
      active = false;
    };
  }, [token, item.id]);

  const handleCreate = async () => {
    if (!token) return;
    setCreating(true);
    setError(null);
    try {
      const emails = recipients
        .split(/[,\s]+/)
        .map((e) => e.trim())
        .filter(Boolean);
      const share = await sharesApi.create(token, item.id, {
        recipientEmails: emails,
        expiresInDays: expiryDays ?? undefined,
      });
      setExisting((prev) => [share, ...(prev ?? [])]);
      setRecipients("");
      setExpiryDays(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the share link.");
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = (share: Share) => {
    void navigator.clipboard.writeText(shareUrl(share.token));
    setCopiedId(share.id);
    setTimeout(() => setCopiedId((id) => (id === share.id ? null : id)), 2000);
  };

  const handleRevoke = async (share: Share) => {
    if (!token) return;
    setExisting((prev) => prev?.map((s) => (s.id === share.id ? { ...s, is_active: false } : s)) ?? null);
    try {
      await sharesApi.revoke(token, share.id);
    } catch {
      // The list will just show it as still active next time it loads;
      // not worth a modal for a background action that rarely fails.
    }
  };

  return (
    <Modal open title={`Share "${item.name}"`} onClose={onClose} width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ fontSize: 13, color: "var(--text-med)", display: "block", marginBottom: 6 }}>
            Restrict to specific people (optional — leave blank for a public link)
          </label>
          <input
            type="text"
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder="alice@example.com, bob@example.com"
            className="form-input"
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label style={{ fontSize: 13, color: "var(--text-med)", display: "block", marginBottom: 6 }}>
            Expires
          </label>
          <select
            value={expiryDays ?? ""}
            onChange={(e) => setExpiryDays(e.target.value ? Number(e.target.value) : null)}
            className="form-input"
            style={{ width: "auto" }}
          >
            {EXPIRY_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.days ?? ""}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {error && <p style={{ color: "var(--error)", fontSize: 13 }}>{error}</p>}

        <button
          type="button"
          className="btn-primary"
          onClick={() => void handleCreate()}
          disabled={creating}
          style={{ alignSelf: "flex-start" }}
        >
          {creating ? <Loader2 size={15} className="spin" /> : null}
          Create share link
        </button>

        <div style={{ borderTop: "1px solid var(--hairline)", paddingTop: 14 }}>
          <p style={{ fontSize: 13, color: "var(--text-med)", marginBottom: 10 }}>
            Existing links for this item
          </p>
          {existing === null ? (
            <p style={{ fontSize: 13, color: "var(--text-med)" }}>Loading…</p>
          ) : existing.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-med)" }}>No links yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {existing.map((share) => (
                <div
                  key={share.id}
                  className="card"
                  style={{
                    padding: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    opacity: share.is_active ? 1 : 0.5,
                  }}
                >
                  {share.recipient_emails.length > 0 ? (
                    <Users size={16} color="var(--text-med)" style={{ flexShrink: 0 }} />
                  ) : (
                    <Globe size={16} color="var(--text-med)" style={{ flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>
                      {share.recipient_emails.length > 0
                        ? share.recipient_emails.join(", ")
                        : "Anyone with the link"}
                    </p>
                    <p style={{ fontSize: 12, color: "var(--text-low)" }}>
                      {!share.is_active
                        ? share.revoked_at
                          ? "Revoked"
                          : "Expired"
                        : share.expires_at
                          ? `Expires ${formatRelativeDate(share.expires_at)}`
                          : "Never expires"}
                    </p>
                  </div>
                  {share.is_active && (
                    <>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleCopy(share)}
                        aria-label="Copy link"
                        style={{ padding: "0 10px" }}
                      >
                        {copiedId === share.id ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => void handleRevoke(share)}
                        aria-label="Revoke"
                        style={{ padding: "0 10px", color: "var(--error)" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
