"use client";

import { useRef, useState } from "react";

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Scroll/pinch to zoom, drag to pan once zoomed. The caller resets this
 * by remounting with a fresh `key` (e.g. `key={item.id}`) whenever the
 * image changes — the standard React way to reset all state on a prop
 * change, rather than an internal effect racing the new image in. */
export function ZoomableImage({
  src,
  alt,
  onError,
}: {
  src: string;
  alt: string;
  onError: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // Whether a drag is in progress is real render state (drives cursor and
  // transition styling); the coordinates driving the math live in a ref
  // since they update on every mousemove and don't need to trigger a
  // render themselves.
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null
  );

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => {
      const next = clamp(z - e.deltaY * 0.0015, MIN_ZOOM, MAX_ZOOM);
      if (next === MIN_ZOOM) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom === 1) return;
    dragState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    setDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState.current) return;
    const { startX, startY, panX, panY } = dragState.current;
    setPan({ x: panX + (e.clientX - startX), y: panY + (e.clientY - startY) });
  };

  const endDrag = () => {
    dragState.current = null;
    setDragging(false);
  };

  return (
    <div
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      onDoubleClick={() => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "default",
        touchAction: "none",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onError={onError}
        draggable={false}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transition: dragging ? "none" : "transform 100ms ease-out",
          userSelect: "none",
        }}
      />
    </div>
  );
}
