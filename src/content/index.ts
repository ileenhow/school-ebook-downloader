import type {
  DownloadCurrentPageResponse,
  TokenStatusChangedMessage,
  TokenStatusResponse
} from "../shared/messages";

const ROOT_ID = "school-ebook-downloader-root";
const LISTENER_FLAG = "__schoolEbookDownloaderTokenListener";

type ContentWindow = Window &
  typeof globalThis & {
    [LISTENER_FLAG]?: boolean;
  };

type PanelElements = {
  shadow: ShadowRoot;
};

void renderFromTokenStatus();

const contentWindow = window as ContentWindow;
if (!contentWindow[LISTENER_FLAG]) {
  contentWindow[LISTENER_FLAG] = true;
  chrome.runtime.onMessage.addListener((message: TokenStatusChangedMessage) => {
    if (message.type === "tokenStatusChanged") {
      renderPanel(message.hasToken);
    }
  });
}

async function renderFromTokenStatus(): Promise<void> {
  try {
    const status = (await chrome.runtime.sendMessage({
      type: "getTokenStatus"
    })) as TokenStatusResponse;

    renderPanel(status.ok && status.hasToken);
  } catch {
    renderPanel(false);
  }
}

function renderPanel(hasToken: boolean): void {
  const { shadow } = ensureRoot();
  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .panel {
        display: grid;
        gap: 8px;
        width: 188px;
        padding: 10px;
        border: 1px solid rgba(10, 36, 57, 0.14);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 10px 30px rgba(10, 36, 57, 0.18);
        backdrop-filter: blur(10px);
      }

      button {
        appearance: none;
        min-height: 36px;
        border: 0;
        border-radius: 6px;
        background: #1565c0;
        color: white;
        cursor: pointer;
        font: 600 14px/1.1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      button.secondary {
        border: 1px solid #9db4c8;
        background: #ffffff;
        color: #174a7a;
      }

      button:disabled {
        cursor: default;
        opacity: 0.65;
      }

      .title {
        margin: 0;
        color: #172b3a;
        font: 700 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .status {
        color: #38546b;
        font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        word-break: break-word;
      }
    </style>
    <section class="panel" aria-label="课本下载助手">
      ${
        hasToken
          ? `
            <button id="downloadButton" type="button">下载 PDF</button>
            <span class="status" id="statusText">已登录，可下载当前课本。</span>
          `
          : `
            <p class="title">登录后可下载</p>
            <span class="status" id="statusText">请先登录智慧教育平台，再下载当前课本 PDF。</span>
            <button id="loginButton" type="button" class="secondary">前往登录</button>
          `
      }
    </section>
  `;

  const downloadButton = shadow.querySelector<HTMLButtonElement>("#downloadButton");
  const loginButton = shadow.querySelector<HTMLButtonElement>("#loginButton");
  const statusText = shadow.querySelector<HTMLElement>("#statusText");

  downloadButton?.addEventListener("click", () => {
    if (statusText) {
      void downloadCurrentPage(downloadButton, statusText);
    }
  });

  loginButton?.addEventListener("click", () => {
    void chrome.runtime.sendMessage({ type: "openLoginPage" });
  });
}

function ensureRoot(): PanelElements {
  const existing = document.getElementById(ROOT_ID);
  if (existing?.shadowRoot) {
    return { shadow: existing.shadowRoot };
  }

  const host = document.createElement("div");
  host.id = ROOT_ID;
  const shadow = host.attachShadow({ mode: "open" });
  document.documentElement.append(host);

  return { shadow };
}

async function downloadCurrentPage(
  button: HTMLButtonElement,
  status: HTMLElement
): Promise<void> {
  button.disabled = true;
  status.textContent = "正在解析资源...";

  try {
    const response = (await chrome.runtime.sendMessage({
      type: "downloadCurrentPage",
      pageUrl: window.location.href
    })) as DownloadCurrentPageResponse;

    if (!response.ok) {
      throw new Error(response.error ?? "下载失败。");
    }

    status.textContent = response.filename ? `已开始下载：${response.filename}` : "已开始下载";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    button.disabled = false;
  }
}
