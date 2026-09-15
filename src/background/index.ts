import {
  fetchCatalogVersion,
  fetchSmartEduCatalog
} from "../shared/catalog";
import {
  CATALOG_CACHE_KEY,
  CATALOG_CACHE_SCHEMA_VERSION,
  LEGACY_CATALOG_CACHE_KEY,
  isCatalogCache,
  type CatalogCache
} from "../shared/catalog-cache";
import { runConcurrentBatch } from "../shared/batch";
import type { SmartEduCredential } from "../shared/auth-token";
import { createSmartEduAuthorization } from "../shared/mac-auth";
import type {
  BatchDownloadProgressMessage,
  BatchDownloadResource,
  BatchDownloadResult,
  CatalogResponse,
  DownloadCurrentPageResponse,
  DownloadResourcesResponse,
  ExtensionRequest,
  ExtensionResponse,
  TokenStatusChangedMessage
} from "../shared/messages";
import {
  clearCredential,
  getCredential,
  getTokenStatus,
  saveCredential
} from "../shared/storage";
import {
  parseSmartEduResource,
  parseSmartEduResourceFromParams,
  type ParsedSmartEduResource
} from "../shared/smartedu";

const LOGIN_URL = "https://auth.smartedu.cn/uias/login";
const BATCH_DOWNLOAD_CONCURRENCY = 3;

let memoryCatalog: CatalogCache | undefined;

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

async function handleRequest(request: ExtensionRequest): Promise<ExtensionResponse> {
  switch (request.type) {
    case "downloadCurrentPage":
      return downloadCurrentPage(request.pageUrl);

    case "downloadResource":
      return downloadResource(request.contentId, request.contentType);

    case "downloadResources":
      return downloadResources(request.jobId, request.resources);

    case "saveCredential":
      await saveCredential(request.credential);
      await notifyMaterialPagesTokenStatus();
      return { ok: true };

    case "getTokenStatus": {
      const status = await getTokenStatus();
      return { ok: true, ...status };
    }

    case "clearToken":
      await clearCredential();
      await notifyMaterialPagesTokenStatus();
      return { ok: true };

    case "openLoginPage":
      await chrome.tabs.create({ url: LOGIN_URL });
      return { ok: true };

    case "getCatalog":
      return getCatalog(request.forceRefresh);
  }
}

async function downloadResources(
  jobId: string,
  requestedResources: BatchDownloadResource[]
): Promise<DownloadResourcesResponse> {
  try {
    await requireCredential();
  } catch (error) {
    return { ok: false, jobId, error: formatError(error) };
  }

  const resources = dedupeResources(requestedResources);
  let succeeded = 0;
  let failed = 0;
  const settled = await runConcurrentBatch(
    resources,
    BATCH_DOWNLOAD_CONCURRENCY,
    async (resource): Promise<BatchDownloadResult> => {
      const parsed = await parseSmartEduResourceFromParams(
        {
          contentId: resource.contentId,
          contentType: resource.contentType || "assets_document"
        }
      );
      const response = await startDownload(parsed);
      return {
        contentId: resource.contentId,
        ok: true,
        title: response.title,
        filename: response.filename,
        downloadId: response.downloadId
      };
    },
    async ({ completed, total, result }) => {
      if (result.status === "fulfilled") {
        succeeded += 1;
      } else {
        failed += 1;
      }

      const progress: BatchDownloadProgressMessage = {
        type: "batchDownloadProgress",
        jobId,
        completed,
        total,
        succeeded,
        failed
      };
      try {
        await chrome.runtime.sendMessage(progress);
      } catch {
        // The popup may have been closed while the background queue continues.
      }
    }
  );

  const results = settled.map((result, index): BatchDownloadResult => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    return {
      contentId: resources[index].contentId,
      ok: false,
      error: formatError(result.reason)
    };
  });

  return { ok: true, jobId, results };
}

function dedupeResources(resources: BatchDownloadResource[]): BatchDownloadResource[] {
  const seen = new Set<string>();
  return resources.filter((resource) => {
    const contentId = resource.contentId.trim();
    if (!contentId || seen.has(contentId)) {
      return false;
    }

    seen.add(contentId);
    return true;
  });
}

async function downloadCurrentPage(pageUrl: string): Promise<DownloadCurrentPageResponse> {
  await requireCredential();
  const resource = await parseSmartEduResource(pageUrl);
  return startDownload(resource);
}

async function downloadResource(
  contentId: string,
  contentType: string
): Promise<DownloadCurrentPageResponse> {
  await requireCredential();
  const resource = await parseSmartEduResourceFromParams(
    {
      contentId,
      contentType: contentType || "assets_document"
    }
  );

  return startDownload(resource);
}

async function startDownload(
  resource: ParsedSmartEduResource
): Promise<DownloadCurrentPageResponse> {
  const credential = await requireCredential();
  const authorization = await createSmartEduAuthorization(resource.downloadUrl, credential);
  const downloadId = await chrome.downloads.download({
    url: resource.downloadUrl,
    filename: resource.filename,
    conflictAction: "uniquify",
    saveAs: false,
    headers: [{ name: "X-ND-AUTH", value: authorization }]
  });

  return {
    ok: true,
    title: resource.title,
    filename: resource.filename,
    downloadId
  };
}

async function requireCredential(): Promise<SmartEduCredential> {
  const credential = await getCredential();

  if (!credential) {
    throw new Error("请先登录智慧教育平台并刷新授权后再下载。");
  }

  return credential;
}

async function getCatalog(forceRefresh = false): Promise<CatalogResponse> {
  const cached = await readCachedCatalog();
  if (cached && !forceRefresh) {
    return toCatalogResponse(cached, true);
  }

  try {
    const version = await fetchCatalogVersion();

    if (cached?.moduleVersion === version.moduleVersion) {
      memoryCatalog = cached;
      return toCatalogResponse(cached, true);
    }

    const fresh = await fetchSmartEduCatalog(version);
    const nextCache: CatalogCache = {
      ...fresh,
      schemaVersion: CATALOG_CACHE_SCHEMA_VERSION,
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

  const result = await chrome.storage.local.get([CATALOG_CACHE_KEY, LEGACY_CATALOG_CACHE_KEY]);
  if (result[LEGACY_CATALOG_CACHE_KEY] !== undefined) {
    await chrome.storage.local.remove(LEGACY_CATALOG_CACHE_KEY);
  }
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

async function notifyMaterialPagesTokenStatus(): Promise<void> {
  const status = await getTokenStatus();
  const message: TokenStatusChangedMessage = {
    type: "tokenStatusChanged",
    ...status
  };
  const tabs = await chrome.tabs.query({
    url: "https://basic.smartedu.cn/tchMaterial*"
  });

  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id) {
        return;
      }

      try {
        await chrome.tabs.sendMessage(tab.id, message);
      } catch {
        // The tab may not have the content script yet; static injection covers normal loads.
      }
    })
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
