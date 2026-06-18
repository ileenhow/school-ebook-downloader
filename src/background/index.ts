import type { BookItem, CatalogFetchResult } from "../shared/catalog";
import {
  fetchCatalogVersion,
  fetchSmartEduCatalog
} from "../shared/catalog";
import type {
  CatalogResponse,
  DownloadCurrentPageResponse,
  ExtensionRequest,
  ExtensionResponse,
  TokenStatusChangedMessage
} from "../shared/messages";
import {
  clearAccessToken,
  getAccessToken,
  getTokenStatus,
  saveAccessToken
} from "../shared/storage";
import {
  parseSmartEduResource,
  parseSmartEduResourceFromParams,
  type ParsedSmartEduResource
} from "../shared/smartedu";

const DETAIL_PAGE_PATTERN = /^https:\/\/basic\.smartedu\.cn\/tchMaterial\/detail/u;
const AUTH_PAGE_PATTERN = /^https:\/\/auth\.smartedu\.cn\//u;
const LOGIN_URL = "https://auth.smartedu.cn/uias/login";
const CATALOG_CACHE_KEY = "smarteduCatalogCache";

type CatalogCache = CatalogFetchResult & {
  updatedAt: string;
};

let memoryCatalog: CatalogCache | undefined;

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) {
    return;
  }

  if (DETAIL_PAGE_PATTERN.test(tab.url)) {
    void injectScript(tabId, "assets/content.js");
    return;
  }

  if (AUTH_PAGE_PATTERN.test(tab.url)) {
    void injectScript(tabId, "assets/auth.js");
  }
});

chrome.runtime.onMessage.addListener((request: ExtensionRequest, _sender, sendResponse) => {
  handleRequest(request)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});

async function injectScript(tabId: number, file: string): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [file]
    });
  } catch {
    // Some internal/error pages reject script injection. Static content scripts still cover normal loads.
  }
}

async function handleRequest(request: ExtensionRequest): Promise<ExtensionResponse> {
  switch (request.type) {
    case "downloadCurrentPage":
      return downloadCurrentPage(request.pageUrl);

    case "downloadResource":
      return downloadResource(request.contentId, request.contentType);

    case "saveToken":
      await saveAccessToken(request.token);
      await notifyDetailPagesTokenStatus();
      return { ok: true };

    case "getTokenStatus": {
      const status = await getTokenStatus();
      return { ok: true, ...status };
    }

    case "clearToken":
      await clearAccessToken();
      await notifyDetailPagesTokenStatus();
      return { ok: true };

    case "openLoginPage":
      await chrome.tabs.create({ url: LOGIN_URL });
      return { ok: true };

    case "getCatalog":
      return getCatalog();
  }
}

async function downloadCurrentPage(pageUrl: string): Promise<DownloadCurrentPageResponse> {
  const accessToken = await requireAccessToken();
  const resource = await parseSmartEduResource(pageUrl, accessToken);
  return startDownload(resource, accessToken);
}

async function downloadResource(
  contentId: string,
  contentType: string
): Promise<DownloadCurrentPageResponse> {
  const accessToken = await requireAccessToken();
  const resource = await parseSmartEduResourceFromParams(
    {
      contentId,
      contentType: contentType || "assets_document"
    },
    accessToken
  );

  return startDownload(resource, accessToken);
}

async function startDownload(
  resource: ParsedSmartEduResource,
  accessToken: string
): Promise<DownloadCurrentPageResponse> {
  const downloadId = await chrome.downloads.download({
    url: resource.downloadUrl,
    filename: resource.filename,
    conflictAction: "uniquify",
    saveAs: false,
    headers: [{ name: "X-ND-AUTH", value: buildAuthHeader(accessToken) }]
  });

  return {
    ok: true,
    title: resource.title,
    filename: resource.filename,
    downloadId
  };
}

async function requireAccessToken(): Promise<string> {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    throw new Error("请先登录智慧教育平台后再下载。");
  }

  return accessToken;
}

async function getCatalog(): Promise<CatalogResponse> {
  const cached = await readCachedCatalog();

  try {
    const version = await fetchCatalogVersion();

    if (cached?.moduleVersion === version.moduleVersion) {
      memoryCatalog = cached;
      return toCatalogResponse(cached, true);
    }

    const fresh = await fetchSmartEduCatalog(version);
    const nextCache: CatalogCache = {
      ...fresh,
      updatedAt: new Date().toISOString()
    };

    await saveCachedCatalog(nextCache);
    return toCatalogResponse(nextCache, false);
  } catch (error) {
    if (cached) {
      return {
        ...toCatalogResponse(cached, true),
        error: `目录接口暂时不可用，已使用本地缓存。${formatError(error)}`
      };
    }

    return {
      ok: false,
      error: formatError(error)
    };
  }
}

async function readCachedCatalog(): Promise<CatalogCache | undefined> {
  if (memoryCatalog) {
    return memoryCatalog;
  }

  const result = await chrome.storage.local.get(CATALOG_CACHE_KEY);
  const candidate = result[CATALOG_CACHE_KEY];

  if (isCatalogCache(candidate)) {
    memoryCatalog = candidate;
    return candidate;
  }

  return undefined;
}

async function saveCachedCatalog(cache: CatalogCache): Promise<void> {
  memoryCatalog = cache;
  await chrome.storage.local.set({ [CATALOG_CACHE_KEY]: cache });
}

function toCatalogResponse(cache: CatalogCache, fromCache: boolean): CatalogResponse {
  return {
    ok: true,
    books: cache.books,
    updatedAt: cache.updatedAt,
    fromCache
  };
}

async function notifyDetailPagesTokenStatus(): Promise<void> {
  const status = await getTokenStatus();
  const message: TokenStatusChangedMessage = {
    type: "tokenStatusChanged",
    ...status
  };
  const tabs = await chrome.tabs.query({
    url: "https://basic.smartedu.cn/tchMaterial/detail*"
  });

  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id) {
        return;
      }

      try {
        await chrome.tabs.sendMessage(tab.id, message);
      } catch {
        // The tab may not have the content script yet. onUpdated/static injection will cover normal loads.
      }
    })
  );
}

function buildAuthHeader(accessToken: string): string {
  return `MAC id="${accessToken}",nonce="0",mac="0"`;
}

function isCatalogCache(value: unknown): value is CatalogCache {
  if (!value || typeof value !== "object") {
    return false;
  }

  const cache = value as Partial<CatalogCache>;
  return (
    typeof cache.moduleVersion === "string" &&
    typeof cache.updatedAt === "string" &&
    Array.isArray(cache.books) &&
    cache.books.every(isBookItem)
  );
}

function isBookItem(value: unknown): value is BookItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const book = value as Partial<BookItem>;
  return (
    typeof book.contentId === "string" &&
    typeof book.contentType === "string" &&
    typeof book.title === "string"
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
