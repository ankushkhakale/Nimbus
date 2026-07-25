"use client";

/**
 * Plots geotagged photos (GPS EXIF read back from thumbnail metadata, see
 * thumbnailer/app.py) on an OpenStreetMap tile view. A small hand-rolled
 * Web Mercator slippy map rather than a mapping library — this app has no
 * other use for one, and the projection math is ~20 lines.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ImageOff, Minus, Plus, X } from "lucide-react";

import { Item, files as filesApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const TILE_SIZE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 18;
const CLUSTER_GRID_PX = 48;

function lonLatToWorldPx(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const x = ((lon + 180) / 360) * worldSize;
  const latRad = (lat * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * worldSize;
  return { x, y };
}

function worldPxToLonLat(x: number, y: number, zoom: number): { lat: number; lon: number } {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const lon = (x / worldSize) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / worldSize;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lon };
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

type Point = { item: Item; lat: number; lon: number };

export function MapView({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (item: Item, all: Item[]) => void;
}) {
  const { token } = useAuth();
  const [points, setPoints] = useState<Point[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [center, setCenter] = useState({ lat: 20, lon: 0 });
  const [zoom, setZoom] = useState(2);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startPx: { x: number; y: number } } | null>(
    null
  );

  useEffect(() => {
    if (!token) return;
    let active = true;
    filesApi
      .mapPoints(token)
      .then(({ photos }) => {
        if (!active) return;
        setPoints(photos);
        // Center on the photos once they arrive, instead of the
        // whole-world default — folded into this callback (rather than a
        // separate effect watching `points`) since it's a one-time
        // reaction to the fetch resolving, not an ongoing sync.
        if (photos.length > 0) {
          const avgLat = photos.reduce((sum, p) => sum + p.lat, 0) / photos.length;
          const avgLon = photos.reduce((sum, p) => sum + p.lon, 0) / photos.length;
          setCenter({ lat: avgLat, lon: avgLon });
          setZoom(photos.length === 1 ? 12 : 4);
        }
        const ids = photos.map((p) => p.item.id);
        if (ids.length > 0) {
          filesApi
            .thumbnailUrls(token, ids)
            .then(({ urls: signed }) => {
              if (active) setUrls(Object.fromEntries(signed.map((s) => [s.item_id, s.url])));
            })
            .catch(() => {});
        }
      })
      .catch(() => active && setPoints([]));
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clampZoom(z + (e.deltaY < 0 ? 1 : -1)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const centerPx = useMemo(() => lonLatToWorldPx(center.lat, center.lon, zoom), [center, zoom]);
  const topLeft = useMemo(
    () => ({ x: centerPx.x - size.width / 2, y: centerPx.y - size.height / 2 }),
    [centerPx, size]
  );
  const tilesAcross = 2 ** zoom;

  const tiles = useMemo(() => {
    if (size.width === 0 || size.height === 0) return [];
    const firstX = Math.floor(topLeft.x / TILE_SIZE) - 1;
    const lastX = Math.floor((topLeft.x + size.width) / TILE_SIZE) + 1;
    const firstY = Math.floor(topLeft.y / TILE_SIZE) - 1;
    const lastY = Math.floor((topLeft.y + size.height) / TILE_SIZE) + 1;
    const out: { key: string; x: number; y: number; left: number; top: number }[] = [];
    for (let ty = firstY; ty <= lastY; ty++) {
      if (ty < 0 || ty >= tilesAcross) continue;
      for (let tx = firstX; tx <= lastX; tx++) {
        const wrapped = ((tx % tilesAcross) + tilesAcross) % tilesAcross;
        out.push({
          key: `${zoom}-${tx}-${ty}`,
          x: wrapped,
          y: ty,
          left: tx * TILE_SIZE - topLeft.x,
          top: ty * TILE_SIZE - topLeft.y,
        });
      }
    }
    return out;
  }, [topLeft, size, zoom, tilesAcross]);

  const markers = useMemo(() => {
    if (!points) return [];
    const buckets = new Map<string, { screenX: number; screenY: number; points: Point[] }>();
    for (const p of points) {
      const px = lonLatToWorldPx(p.lat, p.lon, zoom);
      const screenX = px.x - topLeft.x;
      const screenY = px.y - topLeft.y;
      if (screenX < -50 || screenX > size.width + 50 || screenY < -50 || screenY > size.height + 50) {
        continue;
      }
      const cellKey = `${Math.round(screenX / CLUSTER_GRID_PX)},${Math.round(screenY / CLUSTER_GRID_PX)}`;
      const bucket = buckets.get(cellKey);
      if (bucket) bucket.points.push(p);
      else buckets.set(cellKey, { screenX, screenY, points: [p] });
    }
    return [...buckets.values()];
  }, [points, zoom, topLeft, size]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPx: centerPx };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setCenter(worldPxToLonLat(drag.startPx.x - dx, drag.startPx.y - dy, zoom));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const allItems = points?.map((p) => p.item) ?? [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo map"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--canvas)",
        zIndex: 260,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <p style={{ fontWeight: 600 }}>Map</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="btn-secondary"
          style={{ padding: "0 12px" }}
        >
          <X size={18} />
        </button>
      </header>

      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {points && points.length === 0 ? (
          <p style={{ color: "var(--text-med)", padding: 20 }}>
            No geotagged photos yet. Photos with GPS EXIF data will show up here automatically.
          </p>
        ) : (
          <div
            ref={containerRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              position: "absolute",
              inset: 0,
              cursor: "grab",
              touchAction: "none",
              background: "#aad3df",
            }}
          >
            {tiles.map((t) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={t.key}
                src={`https://tile.openstreetmap.org/${zoom}/${t.x}/${t.y}.png`}
                alt=""
                draggable={false}
                style={{
                  position: "absolute",
                  left: t.left,
                  top: t.top,
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                  userSelect: "none",
                }}
              />
            ))}

            {markers.map((cluster, i) => {
              const single = cluster.points.length === 1 ? cluster.points[0] : null;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (single) {
                      onOpen(single.item, allItems);
                    } else {
                      const avgLat =
                        cluster.points.reduce((s, p) => s + p.lat, 0) / cluster.points.length;
                      const avgLon =
                        cluster.points.reduce((s, p) => s + p.lon, 0) / cluster.points.length;
                      setCenter({ lat: avgLat, lon: avgLon });
                      setZoom((z) => clampZoom(z + 2));
                    }
                  }}
                  title={single ? single.item.name : `${cluster.points.length} photos`}
                  style={{
                    position: "absolute",
                    left: cluster.screenX - 20,
                    top: cluster.screenY - 20,
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    border: "2px solid #fff",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                    padding: 0,
                    overflow: "hidden",
                    cursor: "pointer",
                    background: "var(--primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {single ? (
                    urls[single.item.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={urls[single.item.id]}
                        alt={single.item.name}
                        draggable={false}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <ImageOff size={16} color="#fff" />
                    )
                  ) : (
                    <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>
                      {cluster.points.length}
                    </span>
                  )}
                </button>
              );
            })}

            <div
              style={{
                position: "absolute",
                right: 12,
                bottom: 12,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <button
                type="button"
                className="btn-secondary"
                aria-label="Zoom in"
                onClick={() => setZoom((z) => clampZoom(z + 1))}
                style={{ padding: "0 10px", height: 34 }}
              >
                <Plus size={15} />
              </button>
              <button
                type="button"
                className="btn-secondary"
                aria-label="Zoom out"
                onClick={() => setZoom((z) => clampZoom(z - 1))}
                style={{ padding: "0 10px", height: 34 }}
              >
                <Minus size={15} />
              </button>
            </div>

            <p
              style={{
                position: "absolute",
                left: 8,
                bottom: 4,
                fontSize: 10,
                color: "rgba(0,0,0,0.6)",
                background: "rgba(255,255,255,0.7)",
                padding: "1px 4px",
                borderRadius: 3,
              }}
            >
              © OpenStreetMap contributors
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
