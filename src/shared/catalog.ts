export type BookItem = {
  contentId: string;
  contentType: string;
  title: string;
  stage?: string;
  subject?: string;
  grade?: string;
  publisher?: string;
  volume?: string;
};

export type CatalogFetchResult = {
  moduleVersion: string;
  books: BookItem[];
};

export type CatalogVersion = {
  moduleVersion: string;
  urls: string[];
};

type SmartEduTagNode = {
  tag_id?: string;
  tag_name?: string;
  tag_dimension_id?: string;
  hierarchies?: SmartEduTagHierarchy[] | null;
};

type SmartEduTagHierarchy = {
  children?: SmartEduTagNode[] | null;
};

type SmartEduTagsResponse = {
  hierarchies?: SmartEduTagHierarchy[] | null;
};

type SmartEduVersionResponse = {
  module_version?: string;
  urls?: string | string[];
};

type SmartEduBookResource = {
  id?: string;
  title?: string;
  name?: string;
  resource_type_code?: string;
  tag_paths?: string[];
};

type TagInfo = {
  name: string;
  dimensionId?: string;
};

const TAGS_ENDPOINT = "https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/tags/tch_material_tag.json";
const VERSION_ENDPOINT =
  "https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/version/data_version.json";

const DIMENSION_TO_FIELD: Record<string, keyof Pick<BookItem, "stage" | "subject" | "publisher" | "grade" | "volume">> =
  {
    zxxxd: "stage",
    zxxxk: "subject",
    zxxbb: "publisher",
    zxxnj: "grade",
    zxxcc: "volume"
  };

export async function fetchCatalogVersion(): Promise<CatalogVersion> {
  const data = await fetchJson<SmartEduVersionResponse>(VERSION_ENDPOINT);
  const urls = normalizeUrlList(data.urls);

  if (urls.length === 0) {
    throw new Error("教材目录版本接口没有返回数据分片。");
  }

  return {
    moduleVersion: data.module_version ?? urls.join(","),
    urls
  };
}

export async function fetchSmartEduCatalog(version?: CatalogVersion): Promise<CatalogFetchResult> {
  const resolvedVersion = version ?? (await fetchCatalogVersion());
  const [tagsData, bookParts] = await Promise.all([
    fetchJson<SmartEduTagsResponse>(TAGS_ENDPOINT),
    Promise.all(resolvedVersion.urls.map((url) => fetchJson<SmartEduBookResource[]>(url)))
  ]);

  const tagMap = buildTagMap(tagsData);
  const books = bookParts
    .flat()
    .map((book) => toBookItem(book, tagMap))
    .filter((book): book is BookItem => Boolean(book));

  return {
    moduleVersion: resolvedVersion.moduleVersion,
    books
  };
}

function buildTagMap(data: SmartEduTagsResponse): Map<string, TagInfo> {
  const map = new Map<string, TagInfo>();

  for (const hierarchy of data.hierarchies ?? []) {
    collectTagNodes(hierarchy.children, map);
  }

  return map;
}

function collectTagNodes(nodes: SmartEduTagNode[] | null | undefined, map: Map<string, TagInfo>): void {
  for (const node of nodes ?? []) {
    if (node.tag_id && node.tag_name) {
      map.set(node.tag_id, {
        name: node.tag_name,
        dimensionId: node.tag_dimension_id
      });
    }

    for (const hierarchy of node.hierarchies ?? []) {
      collectTagNodes(hierarchy.children, map);
    }
  }
}

function toBookItem(book: SmartEduBookResource, tagMap: Map<string, TagInfo>): BookItem | undefined {
  if (!book.id) {
    return undefined;
  }

  const title = book.title ?? book.name ?? `未知课本 ${book.id}`;
  const item: BookItem = {
    contentId: book.id,
    contentType: book.resource_type_code ?? "assets_document",
    title
  };

  const tagIds = book.tag_paths?.[0]?.split("/").filter(Boolean) ?? [];
  for (const tagId of tagIds) {
    const tag = tagMap.get(tagId);
    if (!tag?.dimensionId) {
      continue;
    }

    const field = DIMENSION_TO_FIELD[tag.dimensionId];
    if (field && !item[field]) {
      item[field] = tag.name;
    }
  }

  item.volume ??= parseVolumeFromTitle(title);

  return item;
}

function parseVolumeFromTitle(title: string): string | undefined {
  const compactTitle = title.replace(/\s+/gu, " ");
  const patterns = [
    /(?:上册|下册|全一册)/u,
    /(?:必修|选择性必修)\s*第[一二三四五六七八九十\d]+册/u,
    /第[一二三四五六七八九十\d]+册/u,
    /模块\s*[一二三四五六七八九十\d]+/u
  ];

  for (const pattern of patterns) {
    const match = compactTitle.match(pattern);
    if (match?.[0]) {
      return match[0].replace(/\s+/gu, " ");
    }
  }

  return undefined;
}

function normalizeUrlList(urls: SmartEduVersionResponse["urls"]): string[] {
  if (Array.isArray(urls)) {
    return urls.filter(Boolean);
  }

  if (typeof urls === "string") {
    return urls
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean);
  }

  return [];
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "omit" });

  if (!response.ok) {
    throw new Error(`平台接口请求失败：HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}
