import type { ExtensionRequest, ExtensionResponse } from "../shared/messages";
import {
  clearAccessToken,
  getAccessToken,
  getTokenStatus,
  saveAccessToken
} from "../shared/storage";
import { parseSmartEduResource } from "../shared/smartedu";

const DETAIL_PAGE_PATTERN = /^https:\/\/basic\.smartedu\.cn\/tchMaterial\/detail/u;
const AUTH_PAGE_PATTERN = /^https:\/\/auth\.smartedu\.cn\//u;

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

    case "saveToken":
      await saveAccessToken(request.token);
      return { ok: true };

    case "getTokenStatus": {
      const status = await getTokenStatus();
      return { ok: true, ...status };
    }

    case "clearToken":
      await clearAccessToken();
      return { ok: true };
  }
}

async function downloadCurrentPage(pageUrl: string): Promise<ExtensionResponse> {
  const accessToken = await getAccessToken();
  const resource = await parseSmartEduResource(pageUrl, accessToken);
  const headers = accessToken
    ? [{ name: "X-ND-AUTH", value: `MAC id="${accessToken}",nonce="0",mac="0"` }]
    : undefined;

  const downloadId = await chrome.downloads.download({
    url: resource.downloadUrl,
    filename: resource.filename,
    conflictAction: "uniquify",
    saveAs: false,
    headers
  });

  return {
    ok: true,
    title: resource.title,
    filename: resource.filename,
    downloadId
  };
}
