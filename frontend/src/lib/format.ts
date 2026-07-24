/** Display formatting helpers. */

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes === 0) return "0 B";

  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  // Whole numbers for bytes, one decimal above that.
  return `${exponent === 0 ? value : value.toFixed(1)} ${UNITS[exponent]}`;
}

/**
 * S3 Standard is $0.023/GB-month in ap-south-1. Quoted in rupees because
 * the whole cost model for this project is reasoned about in rupees
 * (requirements.md §3). The FX rate is a snapshot, not live.
 */
const USD_PER_GB_MONTH = 0.023;
const INR_PER_USD = 96.3;

export function estimatedMonthlyCostInr(bytes: number): number {
  return (bytes / 1024 ** 3) * USD_PER_GB_MONTH * INR_PER_USD;
}

export function formatInr(amount: number): string {
  if (amount > 0 && amount < 1) return "<₹1";
  return `₹${amount.toFixed(amount < 10 ? 1 : 0)}`;
}

/** Dates from the API are naive UTC; mark them so they aren't read as local. */
function parseUtc(iso: string): Date {
  const hasZone = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso);
  return new Date(hasZone ? iso : `${iso}Z`);
}

export function formatRelativeDate(iso: string): string {
  const date = parseUtc(iso);
  const seconds = (Date.now() - date.getTime()) / 1000;

  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 172800) return "Yesterday";
  if (seconds < 31536000) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Heading for a photo-grid group, e.g. "August 2024". */
export function formatMonthHeading(iso: string): string {
  return parseUtc(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function isImage(contentType: string | null): boolean {
  return Boolean(contentType?.startsWith("image/"));
}

export function isVideo(contentType: string | null): boolean {
  return Boolean(contentType?.startsWith("video/"));
}

export function isAudio(contentType: string | null): boolean {
  return Boolean(contentType?.startsWith("audio/"));
}
