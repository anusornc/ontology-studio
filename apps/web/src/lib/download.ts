import type { ExportResult } from "../api/client";

/** MIME types used for the three export formats. */
const MIME_BY_EXTENSION: Record<string, string> = {
  ttl: "text/turtle;charset=utf-8",
  jsonld: "application/ld+json;charset=utf-8",
  json: "application/json;charset=utf-8"
};

function mimeFor(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "json";
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

/**
 * Trigger a browser download for an API export. Extracted so the Export menu can
 * stay focused on UI and tests can verify the fetched payload without touching
 * the DOM download machinery.
 */
export function downloadExport({ filename, content }: ExportResult): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    return;
  }
  try {
    const blob = new Blob([content], { type: mimeFor(filename) });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch {
    // Downloading is best-effort in non-browser environments (jsdom).
  }
}
