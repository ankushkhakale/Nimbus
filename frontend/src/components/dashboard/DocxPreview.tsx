"use client";

/**
 * Renders a .docx file inline by converting it to HTML client-side via
 * mammoth — no server round-trip beyond the same presigned preview URL
 * the Lightbox already fetches for every other file type.
 *
 * mammoth only emits plain semantic markup (paragraphs, tables, basic
 * formatting) from the document's own structure, never script content,
 * so rendering its output directly is the library's normal usage
 * pattern rather than a special XSS exception.
 */

import { useEffect, useState } from "react";

export function DocxPreview({ url, onError }: { url: string; onError: () => void }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const mammoth = await import("mammoth");
        const buffer = await fetch(url).then((r) => r.arrayBuffer());
        const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
        if (active) setHtml(result.value);
      } catch {
        if (active) onError();
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  if (html === null) {
    return <p style={{ color: "var(--text-med)" }}>Loading…</p>;
  }

  return (
    <div
      style={{
        background: "#fff",
        color: "#111",
        borderRadius: 8,
        padding: "40px clamp(20px, 6vw, 80px)",
        maxWidth: 820,
        width: "100%",
        maxHeight: "100%",
        overflowY: "auto",
        boxShadow: "0 0 0 1px var(--hairline-strong)",
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
