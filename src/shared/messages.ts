export type DownloadCurrentPageRequest = {
  type: "downloadCurrentPage";
  pageUrl: string;
};

export type SaveTokenRequest = {
  type: "saveToken";
  token: string;
  source: "auth-page" | "manual";
};

export type GetTokenStatusRequest = {
  type: "getTokenStatus";
};

export type ClearTokenRequest = {
  type: "clearToken";
};

export type ExtensionRequest =
  | DownloadCurrentPageRequest
  | SaveTokenRequest
  | GetTokenStatusRequest
  | ClearTokenRequest;

export type DownloadCurrentPageResponse = {
  ok: boolean;
  title?: string;
  filename?: string;
  downloadId?: number;
  error?: string;
};

export type TokenStatusResponse = {
  ok: boolean;
  hasToken: boolean;
  updatedAt?: string;
};

export type ExtensionResponse =
  | DownloadCurrentPageResponse
  | TokenStatusResponse
  | { ok: boolean; error?: string };

