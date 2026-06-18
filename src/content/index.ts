import type { DownloadCurrentPageResponse } from "../shared/messages";

const ROOT_ID = "school-ebook-downloader-root";

injectDownloadButton();

function injectDownloadButton(): void {
  if (document.getElementById(ROOT_ID)) {
    return;
  }

  const host = document.createElement("div");
  host.id = ROOT_ID;
  const shadow = host.attachShadow({ mode: "open" });
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
        min-width: 168px;
        padding: 10px;
        border: 1px solid rgba(10, 36, 57, 0.14);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 10px 30px rgba(10, 36, 57, 0.18);
        backdrop-filter: blur(10px);
      }

      button {
        appearance: none;
        height: 36px;
        border: 0;
        border-radius: 6px;
        background: #1565c0;
        color: white;
        cursor: pointer;
        font: 600 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      button:disabled {
        cursor: default;
        opacity: 0.65;
      }

      .status {
        max-width: 220px;
        color: #38546b;
        font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        word-break: break-word;
      }
    </style>
    <section class="panel" aria-label="课本下载助手">
      <button type="button">下载 PDF</button>
      <span class="status">已识别课本页面</span>
    </section>
  `;

  document.documentElement.append(host);

  const button = shadow.querySelector("button");
  const status = shadow.querySelector(".status");

  if (!button || !status) {
    return;
  }

  button.addEventListener("click", () => {
    void downloadCurrentPage(button, status);
  });
}

async function downloadCurrentPage(button: HTMLButtonElement, status: Element): Promise<void> {
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

