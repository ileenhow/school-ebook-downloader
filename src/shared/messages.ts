import type { BookItem } from "./catalog";

export type DownloadCurrentPageRequest = {
  type: "downloadCurrentPage";
  pageUrl: string;
};

export type DownloadResourceRequest = {
  type: "downloadResource";
  contentId: string;
  contentType: string;
};

export type BatchDownloadResource = {
  contentId: string;
  contentType: string;
};

export type DownloadResourcesRequest = {
  type: "downloadResources";
  jobId: string;
  resources: BatchDownloadResource[];
};

export type SaveTokenRequest = {
  type: "saveToken";
  token: string;
  source: "auth-page" | "basic-page" | "manual";
};

export type GetTokenStatusRequest = {
  type: "getTokenStatus";
};

export type RecoverTokenRequest = {
  type: "recoverToken";
};

export type ClearTokenRequest = {
  type: "clearToken";
};

export type OpenLoginPageRequest = {
  type: "openLoginPage";
};

export type GetCatalogRequest = {
  type: "getCatalog";
};

export type ExtensionRequest =
  | DownloadCurrentPageRequest
  | DownloadResourceRequest
  | DownloadResourcesRequest
  | SaveTokenRequest
  | GetTokenStatusRequest
  | RecoverTokenRequest
  | ClearTokenRequest
  | OpenLoginPageRequest
  | GetCatalogRequest;

export type DownloadCurrentPageResponse = {
  ok: boolean;
  title?: string;
  filename?: string;
  downloadId?: number;
  error?: string;
};

export type DownloadResourceResponse = DownloadCurrentPageResponse;

export type BatchDownloadResult = {
  contentId: string;
  ok: boolean;
  title?: string;
  filename?: string;
  downloadId?: number;
  error?: string;
};

export type DownloadResourcesResponse = {
  ok: boolean;
  jobId: string;
  results?: BatchDownloadResult[];
  error?: string;
};

export type BatchDownloadProgressMessage = {
  type: "batchDownloadProgress";
  jobId: string;
  completed: number;
  total: number;
  succeeded: number;
  failed: number;
};

export type TokenStatusResponse = {
  ok: boolean;
  hasToken: boolean;
  updatedAt?: string;
};

export type CatalogResponse = {
  ok: boolean;
  books?: BookItem[];
  updatedAt?: string;
  fromCache?: boolean;
  error?: string;
};

export type TokenStatusChangedMessage = {
  type: "tokenStatusChanged";
  hasToken: boolean;
  updatedAt?: string;
};

export type ExtensionResponse =
  | DownloadCurrentPageResponse
  | DownloadResourceResponse
  | DownloadResourcesResponse
  | TokenStatusResponse
  | CatalogResponse
  | { ok: boolean; error?: string };
