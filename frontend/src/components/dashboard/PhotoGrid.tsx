"use client";

/**
 * Google Photos-style date grid.
 *
 * Tiles request /thumbnail-url, which serves the 512px JPEG produced by
 * the thumbnailer Lambda. Generation is asynchronous, so the API falls
 * back to the original for photos whose thumbnail has not landed yet —
 * the grid stays populated either way, just heavier for a moment.
 */

import React, { useEffect, useState } from "react";
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

function PhotoTile({ item }: { item: Item }) {
  const { token } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    filesApi
      .thumbnailUrl(token, item.id)
      .then((r) => {
        if (active) setUrl(r.url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [token, item.id]);

  return (
    <div
      title={item.name}
      style={{
        position: "relative",
        aspectRatio: "1 / 1",
        borderRadius: "var(--radius-sm, 8px)",
        overflow: "hidden",
        background: "rgba(255,255,255,0.05)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {failed ? (
        <ImageOff size={20} color="var(--text-low)" />
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element -- presigned
        // S3 URLs are signed and short-lived; next/image would need them
        // whitelisted as a remote pattern and would proxy every request.
        <img
          src={url}
          alt={item.name}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
    </div>
  );
}

export function PhotoGrid({ photos }: { photos: Item[] }) {
  if (photos.length === 0) return null;

  const ordered = [...photos].sort(
    (a, b) => timestampOf(b).localeCompare(timestampOf(a))
  );

  return (
    <>
      {groupByMonth(ordered).map(([heading, group]) => (
        <section key={heading} style={{ marginBottom: "32px" }}>
          <h3
            style={{
              fontSize: "15px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--text-med)",
            }}
          >
            {heading}
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: "8px",
            }}
          >
            {group.map((photo) => (
              <PhotoTile key={photo.id} item={photo} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
