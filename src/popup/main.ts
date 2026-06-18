import type { DownloadCurrentPageResponse, TokenStatusResponse } from "../shared/messages";
import "./styles.css";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <section class="shell">
    <header>
      <p class="eyebrow">SmartEdu</p>
      <h1>课本下载助手</h1>
    </header>

    <div class="status" id="tokenStatus">正在读取授权状态...</div>

    <div class="actions">
      <button id="downloadCurrent" type="button">下载当前页 PDF</button>
      <button id="openLogin" type="button" class="secondary">刷新授权</button>
      <button id="clearToken" type="button" class="ghost">清除授权</button>
    </div>

    <p class="hint" id="message">打开智慧教育平台课本详情页后，也可以直接使用页面右下角按钮。</p>
  </section>
`;

const tokenStatus = getElement("#tokenStatus");
const message = getElement("#message");
const downloadCurrent = getButton("#downloadCurrent");
const openLogin = getButton("#openLogin");
const clearToken = getButton("#clearToken");

void refreshTokenStatus();

downloadCurrent.addEventListener("click", () => {
  void downloadCurrentTab();
});

openLogin.addEventListener("click", () => {
  void chrome.tabs.create({ url: "https://auth.smartedu.cn/uias/login" });
});

clearToken.addEventListener("click", () => {
  void clearSavedToken();
});

async function downloadCurrentTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url) {
    setMessage("没有找到当前标签页 URL。");
    return;
  }

  if (!tab.url.startsWith("https://basic.smartedu.cn/")) {
    setMessage("请先切换到智慧教育平台的课本详情页。");
    return;
  }

  downloadCurrent.disabled = true;
  setMessage("正在解析当前页面...");

  try {
    const response = (await chrome.runtime.sendMessage({
      type: "downloadCurrentPage",
      pageUrl: tab.url
    })) as DownloadCurrentPageResponse;

    if (!response.ok) {
      throw new Error(response.error ?? "下载失败。");
    }

    setMessage(response.filename ? `已开始下载：${response.filename}` : "已开始下载。");
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error));
  } finally {
    downloadCurrent.disabled = false;
  }
}

async function refreshTokenStatus(): Promise<void> {
  const status = (await chrome.runtime.sendMessage({
    type: "getTokenStatus"
  })) as TokenStatusResponse;

  if (!status.ok) {
    tokenStatus.textContent = "授权状态读取失败";
    return;
  }

  tokenStatus.textContent = status.hasToken
    ? `已捕获 Access Token${formatUpdatedAt(status.updatedAt)}`
    : "尚未捕获 Access Token";
}

async function clearSavedToken(): Promise<void> {
  await chrome.runtime.sendMessage({ type: "clearToken" });
  setMessage("已清除当前会话中的 Access Token。");
  await refreshTokenStatus();
}

function formatUpdatedAt(updatedAt?: string): string {
  if (!updatedAt) {
    return "";
  }

  return `，${new Date(updatedAt).toLocaleString("zh-CN")}`;
}

function getElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }

  return element;
}

function getButton(selector: string): HTMLButtonElement {
  const element = document.querySelector<HTMLButtonElement>(selector);
  if (!element) {
    throw new Error(`Missing button: ${selector}`);
  }

  return element;
}

function setMessage(text: string): void {
  message.textContent = text;
}

