"use client";

/**
 * Canvas-based crop / rotate / brightness / contrast editor, opened from
 * the Lightbox. Saving overwrites the original file's bytes in place
 * (see FileService.start_replace) — there's no versioning yet, so the
 * user must explicitly confirm before it happens.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Crop as CropIcon, RotateCcw, RotateCw, Sun, X, Contrast as ContrastIcon } from "lucide-react";

import { Item, files as filesApi, uploadToS3 } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ConfirmModal } from "@/components/ui/Modal";

type Rotation = 0 | 90 | 180 | 270;
type Rect = { x: number; y: number; width: number; height: number };
type DragMode = "move" | "nw" | "ne" | "sw" | "se";

const MAX_DISPLAY = 640;
const MIN_CROP = 24;

function rotatedNaturalSize(image: HTMLImageElement, rotation: Rotation) {
  const swap = rotation === 90 || rotation === 270;
  return swap
    ? { width: image.naturalHeight, height: image.naturalWidth }
    : { width: image.naturalWidth, height: image.naturalHeight };
}

export function PhotoEditor({
  item,
  imageUrl,
  onClose,
  onSaved,
}: {
  item: Item;
  imageUrl: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { token } = useAuth();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [cropping, setCropping] = useState(false);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ mode: DragMode; startX: number; startY: number; startRect: Rect } | null>(
    null
  );

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setImage(img);
    img.onerror = () => setLoadError(true);
    img.src = imageUrl;
  }, [imageUrl]);

  const rotatedSize = useMemo(
    () => (image ? rotatedNaturalSize(image, rotation) : { width: 0, height: 0 }),
    [image, rotation]
  );
  const scale =
    rotatedSize.width > 0
      ? Math.min(1, MAX_DISPLAY / Math.max(rotatedSize.width, rotatedSize.height))
      : 1;
  const displaySize = { width: rotatedSize.width * scale, height: rotatedSize.height * scale };

  const rotate = (delta: 90 | -90) => {
    setRotation((r) => (((r + delta + 360) % 360) as Rotation));
    setCrop(null);
    setCropping(false);
  };

  const resetAll = () => {
    setRotation(0);
    setCrop(null);
    setCropping(false);
    setBrightness(100);
    setContrast(100);
  };

  const startCropping = () => {
    setCropping(true);
    setCrop({ x: 0, y: 0, width: displaySize.width, height: displaySize.height });
  };

  // Draw the rotated (unbaked-filter, unbaked-crop) image at display
  // resolution. Brightness/contrast are applied live via a CSS filter on
  // the canvas element instead — cheap to preview, baked into pixels only
  // on save.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image || displaySize.width === 0) return;
    canvas.width = displaySize.width;
    canvas.height = displaySize.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const swap = rotation === 90 || rotation === 270;
    const drawW = swap ? displaySize.height : displaySize.width;
    const drawH = swap ? displaySize.width : displaySize.height;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }, [image, rotation, displaySize.width, displaySize.height]);

  const clampRect = (r: Rect): Rect => {
    const width = Math.min(Math.max(r.width, MIN_CROP), displaySize.width);
    const height = Math.min(Math.max(r.height, MIN_CROP), displaySize.height);
    const x = Math.min(Math.max(r.x, 0), displaySize.width - width);
    const y = Math.min(Math.max(r.y, 0), displaySize.height - height);
    return { x, y, width, height };
  };

  // A single stable handler (rather than a per-corner factory created
  // during render) — the drag mode comes from the element's data
  // attribute, so no closure captures a ref write at render time.
  const onHandlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!crop) return;
    const mode = e.currentTarget.dataset.mode as DragMode | undefined;
    if (!mode) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, startRect: crop };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const s = drag.startRect;
    let next: Rect = s;
    if (drag.mode === "move") {
      next = { ...s, x: s.x + dx, y: s.y + dy };
    } else if (drag.mode === "se") {
      next = { ...s, width: s.width + dx, height: s.height + dy };
    } else if (drag.mode === "nw") {
      next = { x: s.x + dx, y: s.y + dy, width: s.width - dx, height: s.height - dy };
    } else if (drag.mode === "ne") {
      next = { x: s.x, y: s.y + dy, width: s.width + dx, height: s.height - dy };
    } else if (drag.mode === "sw") {
      next = { x: s.x + dx, y: s.y, width: s.width - dx, height: s.height + dy };
    }
    setCrop(clampRect(next));
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const bake = (): Promise<Blob | null> =>
    new Promise((resolve) => {
      if (!image) return resolve(null);
      const full = rotatedNaturalSize(image, rotation);
      const rotatedCanvas = document.createElement("canvas");
      rotatedCanvas.width = full.width;
      rotatedCanvas.height = full.height;
      const rctx = rotatedCanvas.getContext("2d");
      if (!rctx) return resolve(null);
      const swap = rotation === 90 || rotation === 270;
      const drawW = swap ? full.height : full.width;
      const drawH = swap ? full.width : full.height;
      rctx.save();
      rctx.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
      rctx.rotate((rotation * Math.PI) / 180);
      rctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
      rctx.restore();

      // Crop coordinates were captured in display (scaled) space; map
      // back to the full-resolution rotated canvas.
      const cropFull: Rect = crop
        ? {
            x: crop.x / scale,
            y: crop.y / scale,
            width: crop.width / scale,
            height: crop.height / scale,
          }
        : { x: 0, y: 0, width: full.width, height: full.height };

      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(cropFull.width));
      out.height = Math.max(1, Math.round(cropFull.height));
      const octx = out.getContext("2d");
      if (!octx) return resolve(null);
      octx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
      octx.drawImage(
        rotatedCanvas,
        cropFull.x,
        cropFull.y,
        cropFull.width,
        cropFull.height,
        0,
        0,
        out.width,
        out.height
      );
      out.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
    });

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const blob = await bake();
      if (!blob) throw new Error("Could not process the image.");
      const { upload_url } = await filesApi.replaceUploadUrl(token, item.id);
      await uploadToS3(upload_url, blob, "image/jpeg");
      await filesApi.completeReplace(token, item.id);
      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't save your edits. The original file is untouched."
      );
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  };

  const dirty = rotation !== 0 || crop !== null || brightness !== 100 || contrast !== 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${item.name}`}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.92)",
        zIndex: 310,
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
        <p style={{ color: "var(--text-high)", fontWeight: 600 }}>Edit {item.name}</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            <X size={16} />
            <span className="btn-label">Cancel</span>
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!dirty || saving || !image}
            onClick={() => setConfirmOpen(true)}
          >
            <Check size={16} />
            <span className="btn-label">{saving ? "Saving…" : "Save"}</span>
          </button>
        </div>
      </header>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 0,
          position: "relative",
        }}
      >
        {loadError ? (
          <p style={{ color: "var(--text-med)" }}>Couldn&apos;t load this image for editing.</p>
        ) : !image ? (
          <p style={{ color: "var(--text-med)" }}>Loading…</p>
        ) : (
          <div
            style={{ position: "relative", width: displaySize.width, height: displaySize.height }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <canvas
              ref={canvasRef}
              style={{
                display: "block",
                filter: `brightness(${brightness}%) contrast(${contrast}%)`,
                borderRadius: 4,
              }}
            />
            {cropping && crop && (
              <>
                <div
                  data-mode="move"
                  onPointerDown={onHandlePointerDown}
                  style={{
                    position: "absolute",
                    left: crop.x,
                    top: crop.y,
                    width: crop.width,
                    height: crop.height,
                    border: "2px solid #fff",
                    boxShadow: "0 0 0 2000px rgba(0,0,0,0.5)",
                    cursor: "move",
                  }}
                >
                  {(["nw", "ne", "sw", "se"] as DragMode[]).map((corner) => (
                    <div
                      key={corner}
                      data-mode={corner}
                      onPointerDown={onHandlePointerDown}
                      style={{
                        position: "absolute",
                        width: 14,
                        height: 14,
                        background: "#fff",
                        borderRadius: "50%",
                        cursor: `${corner}-resize`,
                        top: corner.includes("n") ? -7 : undefined,
                        bottom: corner.includes("s") ? -7 : undefined,
                        left: corner.includes("w") ? -7 : undefined,
                        right: corner.includes("e") ? -7 : undefined,
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          flexWrap: "wrap",
          padding: "14px 20px",
          borderTop: "1px solid var(--hairline)",
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn-secondary"
            aria-label="Rotate left"
            onClick={() => rotate(-90)}
            style={{ padding: "0 12px" }}
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            className="btn-secondary"
            aria-label="Rotate right"
            onClick={() => rotate(90)}
            style={{ padding: "0 12px" }}
          >
            <RotateCw size={16} />
          </button>
          <button
            type="button"
            className={cropping ? "btn-primary" : "btn-secondary"}
            onClick={() => (cropping ? setCropping(false) : startCropping())}
            style={{ padding: "0 12px" }}
          >
            <CropIcon size={16} />
            <span className="btn-label">Crop</span>
          </button>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-med)" }}>
          <Sun size={15} />
          Brightness
          <input
            type="range"
            min={50}
            max={150}
            value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))}
          />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-med)" }}>
          <ContrastIcon size={15} />
          Contrast
          <input
            type="range"
            min={50}
            max={150}
            value={contrast}
            onChange={(e) => setContrast(Number(e.target.value))}
          />
        </label>

        {dirty && (
          <button type="button" className="btn-secondary" onClick={resetAll} style={{ marginLeft: "auto" }}>
            Reset
          </button>
        )}
      </div>

      {error && (
        <p style={{ color: "var(--error)", fontSize: 13, padding: "0 20px 12px" }}>{error}</p>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Save changes?"
        body="This replaces the current image. The original is kept in the file's version history, so you can restore it later."
        confirmLabel={saving ? "Saving…" : "Save"}
        destructive
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void handleSave()}
      />
    </div>
  );
}
