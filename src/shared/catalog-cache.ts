import type { CatalogFetchResult } from "./catalog";

export const CATALOG_CACHE_KEY = "smarteduCatalogCacheV2";
export const LEGACY_CATALOG_CACHE_KEY = "smarteduCatalogCache";
export const CATALOG_CACHE_SCHEMA_VERSION = 2;

export type CatalogCache = CatalogFetchResult & {
  schemaVersion: typeof CATALOG_CACHE_SCHEMA_VERSION;
  updatedAt: string;
};

export function isCatalogCache(value: unknown): value is CatalogCache {
  if (!value || typeof value !== "object") {
    return false;
  }

  const cache = value as Partial<CatalogCache>;
  return (
    cache.schemaVersion === CATALOG_CACHE_SCHEMA_VERSION &&
    typeof cache.moduleVersion === "string" &&
    typeof cache.updatedAt === "string" &&
    Array.isArray(cache.books) &&
    cache.books.every(isBookItem)
  );
}

function isBookItem(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const book = value as Record<string, unknown>;
  return (
    typeof book.contentId === "string" &&
    typeof book.contentType === "string" &&
    typeof book.title === "string" &&
    (book.coverUrl === undefined || typeof book.coverUrl === "string")
  );
}
