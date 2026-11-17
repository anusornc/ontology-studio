/**
 * Naming helpers: convert human labels into machine-safe identifiers.
 *
 * Pure string transforms only. Non-ASCII characters are folded to ASCII via
 * diacritic stripping; characters with no ASCII equivalent are dropped, which
 * lets the `suggest*` helpers fall back to stable defaults.
 */

/** Split a human label into ASCII word chunks. */
function asciiWords(input: string): string[] {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0);
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** `"Research Project"` -> `"ResearchProject"`. */
export function pascalCase(input: string): string {
  return asciiWords(input).map(capitalize).join("");
}

/** `"Start date"` -> `"startDate"`. */
export function camelCase(input: string): string {
  const words = asciiWords(input);
  if (words.length === 0) {
    return "";
  }
  const [first = "", ...rest] = words;
  return first.toLowerCase() + rest.map(capitalize).join("");
}

/** `"Research Project"` -> `"research-project"`. */
export function slugify(input: string): string {
  return asciiWords(input)
    .map((word) => word.toLowerCase())
    .join("-");
}

/** `"startDate"` -> `"Start Date"`. Used for default human labels. */
export function titleCase(input: string): string {
  return asciiWords(input).map(capitalize).join(" ");
}

/** Default machine name for a new class; never empty. */
export function suggestClassName(label: string): string {
  return pascalCase(label) || "Entity";
}

/** Default machine name for a new attribute; never empty. */
export function suggestAttributeName(label: string): string {
  return camelCase(label) || "entity";
}

/** Default machine name for a new relation; never empty. */
export function suggestRelationName(label: string): string {
  return camelCase(label) || "entity";
}

/** Canvas palette; index 0 is the default class colour. */
export const PALETTE = [
  "#6366f1",
  "#22d3ee",
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#a78bfa",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#84cc16"
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface CryptoLike {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
}

function webCrypto(): CryptoLike | undefined {
  return (globalThis as { crypto?: CryptoLike }).crypto;
}

function fallbackUuid(): string {
  const bytes = new Uint8Array(16);
  const crypto = webCrypto();
  if (crypto?.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Random UUID (v4). Uses Web Crypto when available, with a Math.random fallback. */
export function newId(): string {
  const crypto = webCrypto();
  if (crypto?.randomUUID) {
    try {
      const id = crypto.randomUUID();
      if (UUID_PATTERN.test(id)) {
        return id;
      }
    } catch {
      // Fall through to the portable generator.
    }
  }
  return fallbackUuid();
}
