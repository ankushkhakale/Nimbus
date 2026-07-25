"use client";

/**
 * A dismissible strip of photos taken on today's date in a previous
 * year — pure query against data already stored (taken_at), no new
 * infrastructure. Dismissal is per-session only; it reappears tomorrow
 * with a different set of photos anyway.
 */

import { useEffect, useState } from "react";
import { ImageOff, Sparkles, X } from "lucide-react";

import { Item, files as filesApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export function OnThisDay({ onOpen }: { onOpen: (item: Item, all: Item[]) => void }) {
  const { token } = useAuth();
  const [items, setItems] = useState<Item[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    filesApi
      .onThisDay(token)
      .then((found) => {
        if (!active) return;
        setItems(found);
        if (found.length === 0) return;
        return filesApi.thumbnailUrls(token, found.map((i) => i.id)).then(({ urls: signed }) => {
          if (!active) return;
          setUrls(Object.fromEntries(signed.map((s) => [s.item_id, s.url])));
        });
      })
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, [token]);

  if (dismissed || !items || items.length === 0) return null;

  return (
    <div className="card" style={{ padding: 16, marginBottom: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={16} color="var(--primary)" />
          <strong style={{ fontSize: 14 }}>On this day</strong>
          <span style={{ fontSize: 13, color: "var(--text-med)" }}>
            {items.length === 1 ? "1 photo" : `${items.length} photos`}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-med)",
            cursor: "pointer",
            display: "flex",
          }}
        >
          <X size={15} />
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
          gap: 8,
        }}
      >
        {items.slice(0, 12).map((item) => (
          <OnThisDayTile
            key={item.id}
            item={item}
            url={urls[item.id]}
            onOpen={() => onOpen(item, items)}
          />
        ))}
      </div>
    </div>
  );
}

function OnThisDayTile({
  item,
  url,
  onOpen,
}: {
  item: Item;
  url: string | undefined;
  onOpen: (item: Item) => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      title={item.name}
      onClick={() => onOpen(item)}
      style={{
        aspectRatio: "1 / 1",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        border: "none",
        padding: 0,
        cursor: "pointer",
        background: "var(--surface-elevated)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {failed || !url ? (
        <ImageOff size={18} color="var(--text-low)" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={item.name}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
    </button>
  );
}
