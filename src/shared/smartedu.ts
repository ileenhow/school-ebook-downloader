export type ParsedSmartEduResource = {
  title: string;
  downloadUrl: string;
  filename: string;
};

type SmartEduResourceItem = {
  ti_file_flag?: string;
  ti_is_source_file?: boolean;
  ti_storage?: string;
  ti_storages?: string[];
};

type SmartEduResourceDetails = {
  title?: string;
  name?: string;
  ti_items?: SmartEduResourceItem[];
};

type SmartEduThematicResource = SmartEduResourceDetails & {
  resource_type_code?: string;
};

const PRIVATE_RESOURCE_BASE = "https://r1-ndr-private.ykt.cbern.com.cn";

export async function parseSmartEduResource(
  pageUrl: string,
  accessToken: string
): Promise<ParsedSmartEduResource> {
  const params = parsePageUrl(pageUrl);
  return parseSmartEduResourceFromParams(params, accessToken);
}

export async function parseSmartEduResourceFromParams(
  params: {
    contentId: string;
    contentType: string;
    isBasicWork?: boolean;
  },
  _accessToken: string
): Promise<ParsedSmartEduResource> {
  const details = await fetchResourceDetails(params);
  const downloadUrl =
    findSourceDownloadUrl(details.ti_items) ??
    (params.contentType === "thematic_course"
      ? await findThematicDocumentUrl(params.contentId)
      : undefined);

  if (!downloadUrl) {
    throw new Error("没有在资源元数据中找到可下载的 PDF 文件。");
  }

  const title = details.title ?? details.name ?? params.contentId;

  return {
    title,
    downloadUrl,
    filename: `${sanitizeFilename(title)}.pdf`
  };
}

function parsePageUrl(pageUrl: string): {
  contentId: string;
  contentType: string;
  isBasicWork: boolean;
} {
  const url = new URL(pageUrl);
  const contentId = url.searchParams.get("contentId");
  const contentType = url.searchParams.get("contentType") ?? "assets_document";

  if (!contentId) {
    throw new Error("当前页面 URL 中没有 contentId，无法解析资源。");
  }

  return {
    contentId,
    contentType,
    isBasicWork: /\/syncClassroom\/basicWork\/detail/.test(url.pathname)
  };
}

async function fetchResourceDetails(params: {
  contentId: string;
  contentType: string;
  isBasicWork?: boolean;
}): Promise<SmartEduResourceDetails> {
  const endpoint =
    params.isBasicWork || params.contentType === "thematic_course"
      ? `https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/special_edu/resources/details/${params.contentId}.json`
      : `https://s-file-1.ykt.cbern.com.cn/zxx/ndrv2/resources/tch_material/details/${params.contentId}.json`;

  return fetchJson<SmartEduResourceDetails>(endpoint);
}

async function findThematicDocumentUrl(contentId: string): Promise<string | undefined> {
  const resources = await fetchJson<SmartEduThematicResource[]>(
    `https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/special_edu/thematic_course/${contentId}/resources/list.json`
  );

  for (const resource of resources) {
    if (resource.resource_type_code !== "assets_document") {
      continue;
    }

    const url = findSourceDownloadUrl(resource.ti_items);
    if (url) {
      return url;
    }
  }

  return undefined;
}

function findSourceDownloadUrl(items: SmartEduResourceItem[] | undefined): string | undefined {
  if (!items) {
    return undefined;
  }

  for (const item of items) {
    if (!item.ti_is_source_file) {
      continue;
    }

    if (item.ti_storage) {
      return normalizeStorageUrl(item.ti_storage);
    }

    const storageUrl = item.ti_storages?.find(Boolean);
    if (storageUrl) {
      return storageUrl.startsWith("cs_path:")
        ? normalizeStorageUrl(storageUrl)
        : storageUrl;
    }
  }

  return undefined;
}

function normalizeStorageUrl(storage: string): string {
  return storage.replace("cs_path:${ref-path}", PRIVATE_RESOURCE_BASE);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "omit" });

  if (!response.ok) {
    throw new Error(`平台接口请求失败：HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

function sanitizeFilename(filename: string): string {
  const sanitized = filename
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "_")
    .replace(/\s+/gu, " ")
    .trim();

  return (sanitized || "smartedu-ebook").slice(0, 120);
}
