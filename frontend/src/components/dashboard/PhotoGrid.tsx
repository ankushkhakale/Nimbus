"use client";

/**
 * Google Photos-style date grid.
 *
 * URLs are signed in batches rather than one request per tile. The
 * previous version cost one Lambda invocation per photo, so a library of
 * a few thousand images could burn the monthly free tier in a handful of
 * page views.
 */

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";

import { Item, files as filesApi } from "@/lib/api";
import { formatMonthHeading } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

/** Sort by capture time when known, falling back to upload time. */
function timestampOf(item: Item): string {
  return item.taken_at ?? item.created_at;
}

function groupByMonth(photos: Item[]): [string, Item[]][] {
  const groups = new Map<string, Item[]>();
  for (const photo of photos) {
    const heading = formatMonthHeading(timestampOf(photo));
    const bucket = groups.get(heading);
    if (bucket) bucket.push(photo);
    else groups.set(heading, [photo]);
  }
  return Array.from(groups.entries());
}

export function PhotoGrid({
  photos,
  selected,
  onToggleSelect,
  onOpen,
}: {
  photos: Item[];
  selected: Set<string>;
  onToggleSelect: (id: string, exclusive?: boolean) => void;
  onOpen: (item: Item) => void;
}) {
  const { token } = useAuth();
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token || photos.length === 0) return;
    let active = true;

    // Only fetch what is missing, so paging in more photos does not
    // re-sign the ones already on screen.
    const missing = photos.map((p) => p.id).filter((id) => !(id in urls));
    if (missing.length === 0) return;

    // Chunked to stay under the API's per-request cap.
    const CHUNK = 200;
    (async () => {
      for (let i = 0; i < missing.length; i += CHUNK) {
        try {
          const { urls: signed } = await filesApi.thumbnailUrls(
            token,
            missing.slice(i, i + CHUNK)
          );
          if (!active) return;
          setUrls((prev) => ({
            ...prev,
            ...Object.fromEntries(signed.map((s) => [s.item_id, s.url])),
          }));
        } catch {
          /* tiles fall back to a placeholder */
        }
      }
    })();

    return () => {
      active = false;
    };
    // `urls` is deliberately not a dependency: including it would re-run
    // this effect on every successful batch and loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, photos]);

  if (photos.length === 0) return null;

  const ordered = [...photos].sort((a, b) =>
    timestampOf(b).localeCompare(timestampOf(a))
  );

  return (
    <>
      {groupByMonth(ordered).map(([heading, group]) => (
        <section key={heading} style={{ marginBottom: 32 }}>
          <h3
            style={{
              fontSize: 15,
              fontWeight: 600,
              marginBottom: 12,
              color: "var(--text-med)",
            }}
          >
            {heading}
          </h3>
          <div
            className="photo-grid"
            style={{
              display: "grid",
              // The .photo-grid class overrides this to tighter columns on
              // a phone; this inline value is the desktop default.
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 8,
            }}
          >
            {group.map((photo) => (
              <PhotoTile
                key={photo.id}
                item={photo}
                url={urls[photo.id]}
                isSelected={selected.has(photo.id)}
                onToggleSelect={onToggleSelect}
                onOpen={onOpen}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function PhotoTile({
  item,
  url,
  isSelected,
  onToggleSelect,
  onOpen,
}: {
  item: Item;
  url: string | undefined;
  isSelected: boolean;
  onToggleSelect: (id: string, exclusive?: boolean) => void;
  onOpen: (item: Item) => void;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      title={item.name}
      onClick={(e) => (e.metaKey || e.ctrlKey ? onToggleSelect(item.id) : onOpen(item))}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(item);
        if (e.key === " ") {
          e.preventDefault();
          onToggleSelect(item.id);
        }
      }}
      style={{
        position: "relative",
        aspectRatio: "1 / 1",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        background: "var(--surface-card)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        outline: isSelected ? "2px solid var(--primary)" : "none",
        outlineOffset: -2,
      }}
    >
      {failed ? (
        <ImageOff size={20} color="var(--text-low)" />
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={item.name}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}

      <button
        type="button"
        aria-label={isSelected ? "Deselect" : "Select"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(item.id);
        }}
        style={{
          position: "absolute",
          top: 6,
          left: 6,
          width: 20,
          height: 20,
          borderRadius: "50%",
          border: "2px solid rgba(255,255,255,0.85)",
          background: isSelected ? "var(--primary)" : "rgba(0,0,0,0.35)",
          cursor: "pointer",
          padding: 0,
        }}
      />
    </div>
  );
}
