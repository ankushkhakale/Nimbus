"use client";

/**
 * Bundle several items into a single .zip entirely in the browser — no
 * Lambda proxying of bytes. Each file is fetched from its presigned
 * download URL and streamed into a JSZip archive; folders are walked
 * recursively so the zip preserves the original tree.
 *
 * This holds every selected file in memory at once, which is fine for
 * the personal-scale libraries this project targets but would need a
 * streaming approach for tens-of-GB selections. onProgress reports
 * per-file completion so the caller can show a count.
 */

import JSZip from "jszip";

import { Item, files as filesApi } from "./api";

async function addItemToZip(
  zip: JSZip,
  item: Item,
  prefix: string,
  token: string,
  onFile: () => void
): Promise<void> {
  if (item.type === "folder") {
    // Walk the folder's contents, paging through in case it's large.
    const folderPath = `${prefix}${item.name}/`;
    // A trailing folder entry keeps empty folders present in the zip.
    zip.folder(folderPath.slice(0, -1));
    let offset = 0;
    for (;;) {
      const page = await filesApi.list(token, item.id, { offset, limit: 100, sort: "name" });
      for (const child of page.items) {
        await addItemToZip(zip, child, folderPath, token, onFile);
      }
      offset += page.items.length;
      if (offset >= page.total || page.items.length === 0) break;
    }
    return;
  }

  const { download_url } = await filesApi.downloadUrl(token, item.id);
  const blob = await fetch(download_url).then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch ${item.name} (${r.status}).`);
    return r.blob();
  });
  zip.file(`${prefix}${item.name}`, blob);
  onFile();
}

/**
 * Build a zip of the given items and trigger a browser download. Returns
 * when the download has been handed to the browser.
 */
export async function downloadItemsAsZip(
  items: Item[],
  token: string,
  filename: string,
  onProgress?: (filesDone: number) => void
): Promise<void> {
  const zip = new JSZip();
  let done = 0;
  const onFile = () => {
    done += 1;
    onProgress?.(done);
  };

  for (const item of items) {
    await addItemToZip(zip, item, "", token, onFile);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".zip") ? filename : `${filename}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
