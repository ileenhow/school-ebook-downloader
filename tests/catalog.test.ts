import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchCatalogVersion,
  normalizeTrustedCatalogAssetUrl,
  type BookItem
} from "../src/shared/catalog";
import {
  CATALOG_CACHE_SCHEMA_VERSION,
  isCatalogCache
} from "../src/shared/catalog-cache";

afterEach(() => {
  vi.unstubAllGlobals();
});

const book: BookItem = {
  contentId: "book-1",
  contentType: "assets_document",
  title: "测试课本",
  coverUrl: "https://r1-ndr.ykt.cbern.com.cn/assets/book-1.t/image/1.jpg"
};

describe("catalog cover URLs", () => {
  it("accepts official HTTPS asset URLs", () => {
    expect(
      normalizeTrustedCatalogAssetUrl(
        "https://r2-ndr.ykt.cbern.com.cn/assets/book-1.t/image/1.jpg?v=1"
      )
    ).toBe("https://r2-ndr.ykt.cbern.com.cn/assets/book-1.t/image/1.jpg?v=1");
  });

  it.each([
    "http://r1-ndr.ykt.cbern.com.cn/assets/book-1.t/image/1.jpg",
    "https://ykt.cbern.com.cn.attacker.example/assets/book-1.t/image/1.jpg",
    "https://user:secret@r1-ndr.ykt.cbern.com.cn/assets/book-1.t/image/1.jpg",
    "https://r1-ndr.ykt.cbern.com.cn:8443/assets/book-1.t/image/1.jpg",
    "not a URL"
  ])("rejects an untrusted cover URL: %s", (url) => {
    expect(normalizeTrustedCatalogAssetUrl(url)).toBeUndefined();
  });
});

describe("catalog version", () => {
  it("normalizes the platform's numeric module version for cache comparison", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            module_version: 1919079415,
            urls: "https://s-file-1.ykt.cbern.com.cn/catalog.json"
          }),
          { status: 200 }
        )
      )
    );

    await expect(fetchCatalogVersion()).resolves.toEqual({
      moduleVersion: "1919079415",
      urls: ["https://s-file-1.ykt.cbern.com.cn/catalog.json"]
    });
  });
});

describe("catalog cache schema", () => {
  it("rejects the legacy cache and accepts schema version 2", () => {
    const base = {
      moduleVersion: "version-1",
      books: [book],
      updatedAt: new Date().toISOString()
    };

    expect(isCatalogCache(base)).toBe(false);
    expect(
      isCatalogCache({
        ...base,
        schemaVersion: CATALOG_CACHE_SCHEMA_VERSION
      })
    ).toBe(true);
  });
});
