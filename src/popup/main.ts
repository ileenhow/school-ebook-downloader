import type { BookItem } from "../shared/catalog";
import type {
  BatchDownloadProgressMessage,
  CatalogResponse,
  DownloadCurrentPageResponse,
  DownloadResourceResponse,
  DownloadResourcesResponse,
  TokenStatusResponse
} from "../shared/messages";
import alipaySupportQrUrl from "../assets/alipay-support-qr.png";
import wechatSupportQrUrl from "../assets/wechat-support-qr.png";
import { BookSelection } from "./selection";
import "./styles.css";

const MAX_RESULTS = 80;
const FILTER_KEYS = ["stage", "subject", "grade", "publisher", "volume"] as const;

type FilterKey = (typeof FILTER_KEYS)[number];

const FILTER_LABELS: Record<FilterKey, string> = {
  stage: "学段",
  subject: "学科",
  grade: "年级",
  publisher: "出版社/版本",
  volume: "册次"
};

let books: BookItem[] = [];
let filters = createEmptyFilters();
let catalogMeta: Pick<CatalogResponse, "updatedAt" | "fromCache" | "error"> = {};
const selection = new BookSelection();
let batchDownloading = false;
const extensionVersion = chrome.runtime.getManifest().version;

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <section class="shell">
    <header class="header">
      <h1>智慧教育平台课本下载助手 <span class="version">v${extensionVersion}</span></h1>
      <span class="badge" id="tokenStatus">正在读取授权</span>
    </header>

    <main id="panel"></main>
    <p class="message" id="message" aria-live="polite"></p>

    <footer class="support">
      <details>
        <summary>联系与支持</summary>
        <div class="support-content">
          <p class="support-email">
            <span>联系开发者</span>
            <a href="mailto:linc74030@gmail.com">linc74030@gmail.com</a>
          </p>
          <div class="support-payment">
            <p>如果我的扩展帮到了你，欢迎打赏一瓶肥宅快乐水，不打赏也不影响扩展功能！</p>
            <div class="payment-options">
              <figure class="payment-option">
                <img
                  src="${alipaySupportQrUrl}"
                  alt="支付宝支持开发者二维码"
                  width="164"
                  height="162"
                >
                <figcaption>支付宝</figcaption>
              </figure>
              <figure class="payment-option">
                <img
                  src="${wechatSupportQrUrl}"
                  alt="微信支持开发者二维码"
                  width="164"
                  height="165"
                >
                <figcaption>微信</figcaption>
              </figure>
            </div>
          </div>
        </div>
      </details>
    </footer>
  </section>
`;

const tokenStatus = getElement("#tokenStatus");
const panel = getElement("#panel");
const message = getElement("#message");

void initialize();

async function initialize(): Promise<void> {
  setMessage("");

  try {
    const initialStatus = await getTokenStatus();
    const status = initialStatus.ok && !initialStatus.hasToken
      ? await recoverToken()
      : initialStatus;
    if (status.ok && status.hasToken) {
      renderLoggedIn(status);
      await loadCatalog();
      return;
    }

    renderLoggedOut(status);
  } catch (error) {
    tokenStatus.textContent = "异常 · 授权读取失败";
    renderLoggedOutActions();
    setMessage(error instanceof Error ? error.message : String(error));
  }
}

function renderLoggedOut(status?: TokenStatusResponse): void {
  tokenStatus.textContent = "未登录 · 无 Access Token";
  tokenStatus.title = status?.updatedAt
    ? `上次捕获：${formatDate(status.updatedAt)}`
    : "当前会话没有可用 Access Token";
  books = [];
  filters = createEmptyFilters();
  catalogMeta = {};
  selection.clear();
  batchDownloading = false;
  renderLoggedOutActions();
}

function renderLoggedOutActions(): void {
  panel.innerHTML = `
    <section class="login-panel">
      <h2>登录后可下载课本</h2>
      <p>请先登录智慧教育平台。登录页打开后，扩展会自动捕获当前会话授权。</p>
      <button id="openLogin" type="button">前往登录 / 刷新授权</button>
    </section>
  `;

  getButton("#openLogin").addEventListener("click", () => {
    void openLoginPage();
  });
}

function renderLoggedIn(status: TokenStatusResponse): void {
  tokenStatus.textContent = "已登录 · Token 已捕获";
  tokenStatus.title = status.updatedAt
    ? `捕获时间：${formatDate(status.updatedAt)}`
    : "当前会话已捕获 Access Token";
  panel.innerHTML = `
    <div class="actions">
      <button id="downloadCurrent" type="button">下载当前页 PDF</button>
      <button id="refreshAuth" type="button" class="secondary">刷新授权</button>
      <button id="clearToken" type="button" class="ghost">清除授权</button>
    </div>
    <section class="catalog" id="catalogPanel">
      <div class="loading">正在加载教材目录...</div>
    </section>
  `;

  getButton("#downloadCurrent").addEventListener("click", () => {
    void downloadCurrentTab();
  });
  getButton("#refreshAuth").addEventListener("click", () => {
    void openLoginPage();
  });
  getButton("#clearToken").addEventListener("click", () => {
    void clearSavedToken();
  });
}

async function loadCatalog(): Promise<void> {
  const catalogPanel = getElement("#catalogPanel");
  catalogPanel.innerHTML = `<div class="loading">正在加载教材目录...</div>`;

  try {
    const response = (await chrome.runtime.sendMessage({
      type: "getCatalog"
    })) as CatalogResponse;

    if (!response.ok) {
      throw new Error(response.error ?? "目录加载失败。");
    }

    books = response.books ?? [];
    selection.retain(books.map((book) => book.contentId));
    catalogMeta = {
      updatedAt: response.updatedAt,
      fromCache: response.fromCache,
      error: response.error
    };
    filters = normalizeFilters(filters);
    renderCatalogBrowser();
  } catch (error) {
    renderCatalogError(error instanceof Error ? error.message : String(error));
  }
}

function renderCatalogBrowser(): void {
  const catalogPanel = getElement("#catalogPanel");
  const activeFilters = FILTER_KEYS.filter((key) => filters[key]);
  const matchedBooks = activeFilters.length > 0 ? books.filter((book) => matchesFilters(book)) : [];
  const visibleBooks = matchedBooks.slice(0, MAX_RESULTS);

  catalogPanel.innerHTML = `
    <div class="catalog-head">
      <div>
        <h2>选择课本</h2>
        <p>${formatCatalogMeta()}</p>
      </div>
      <button id="reloadCatalog" type="button" class="ghost small">刷新目录</button>
    </div>

    ${catalogMeta.error ? `<div class="notice">${escapeHtml(catalogMeta.error)}</div>` : ""}

    <div class="filters">
      ${FILTER_KEYS.map(renderFilterSelect).join("")}
    </div>

    <div class="result-summary">${renderResultSummary(activeFilters.length, matchedBooks.length)}</div>
    ${renderSelectionToolbar(activeFilters.length, visibleBooks)}
    <div class="results" id="results">
      ${renderResults(activeFilters.length, visibleBooks, matchedBooks.length)}
    </div>
  `;

  getButton("#reloadCatalog").addEventListener("click", () => {
    void loadCatalog();
  });

  for (const select of catalogPanel.querySelectorAll<HTMLSelectElement>("select[data-filter]")) {
    select.addEventListener("change", () => {
      const key = select.dataset.filter as FilterKey;
      filters[key] = select.value;
      filters = normalizeFilters(filters);
      setMessage("");
      renderCatalogBrowser();
    });
  }

  for (const button of catalogPanel.querySelectorAll<HTMLButtonElement>("button[data-content-id]")) {
    button.addEventListener("click", () => {
      const book = books.find((item) => item.contentId === button.dataset.contentId);
      if (book) {
        void downloadBook(book, button);
      }
    });
  }

  for (const checkbox of catalogPanel.querySelectorAll<HTMLInputElement>("input[data-select-content-id]")) {
    checkbox.addEventListener("change", () => {
      const contentId = checkbox.dataset.selectContentId;
      if (contentId) {
        selection.set(contentId, checkbox.checked);
        updateSelectionControls(visibleBooks);
      }
    });
  }

  const selectVisible = catalogPanel.querySelector<HTMLInputElement>("#selectVisible");
  selectVisible?.addEventListener("change", () => {
    selection.setMany(
      visibleBooks.map((book) => book.contentId),
      selectVisible.checked
    );
    updateSelectionControls(visibleBooks);
  });

  catalogPanel.querySelector<HTMLButtonElement>("#clearSelected")?.addEventListener("click", () => {
    selection.clear();
    updateSelectionControls(visibleBooks);
  });

  catalogPanel.querySelector<HTMLButtonElement>("#downloadSelected")?.addEventListener("click", () => {
    void downloadSelectedBooks(visibleBooks);
  });

  updateSelectionControls(visibleBooks);
}

function renderCatalogError(error: string): void {
  const catalogPanel = getElement("#catalogPanel");
  catalogPanel.innerHTML = `
    <section class="empty-state">
      <h2>目录加载失败</h2>
      <p>${escapeHtml(error)}</p>
      <button id="retryCatalog" type="button">重试</button>
    </section>
  `;

  getButton("#retryCatalog").addEventListener("click", () => {
    void loadCatalog();
  });
}

function renderFilterSelect(key: FilterKey): string {
  const options = getOptionsFor(key);
  const selectedValue = filters[key];

  return `
    <label class="filter">
      <span>${FILTER_LABELS[key]}</span>
      <select data-filter="${key}">
        <option value="">全部</option>
        ${options
          .map(
            (option) =>
              `<option value="${escapeHtml(option)}" ${option === selectedValue ? "selected" : ""}>${escapeHtml(
                option
              )}</option>`
          )
          .join("")}
      </select>
    </label>
  `;
}

function renderResultSummary(activeFilterCount: number, total: number): string {
  if (activeFilterCount === 0) {
    return "选择至少一个筛选条件后显示匹配课本。";
  }

  if (total === 0) {
    return "没有找到匹配课本。";
  }

  return total > MAX_RESULTS
    ? `共 ${total} 本，显示前 ${MAX_RESULTS} 本。继续缩小筛选可更快定位。`
    : `共 ${total} 本匹配课本。`;
}

function renderSelectionToolbar(activeFilterCount: number, visibleBooks: BookItem[]): string {
  if (activeFilterCount === 0 && selection.size === 0) {
    return "";
  }

  if (visibleBooks.length === 0 && selection.size === 0) {
    return "";
  }

  return `
    <div class="selection-toolbar" aria-label="批量下载工具栏">
      <label class="select-visible-label">
        <input id="selectVisible" type="checkbox" ${batchDownloading ? "disabled" : ""}>
        <span>全选当前显示</span>
      </label>
      <span class="selection-count" id="selectionCount">已选 ${selection.size} 本</span>
      <div class="selection-actions">
        <button id="clearSelected" type="button" class="ghost small">清除</button>
        <button id="downloadSelected" type="button" class="small">下载所选</button>
      </div>
    </div>
  `;
}

function renderResults(activeFilterCount: number, visibleBooks: BookItem[], total: number): string {
  if (activeFilterCount === 0) {
    return `<div class="empty-state compact">先选择学段、学科或年级。</div>`;
  }

  if (total === 0) {
    return `<div class="empty-state compact">换一组筛选条件试试。</div>`;
  }

  return visibleBooks
    .map(
      (book) => `
        <article class="result">
          <input
            type="checkbox"
            class="book-checkbox"
            data-select-content-id="${escapeHtml(book.contentId)}"
            aria-label="选择 ${escapeHtml(book.title)}"
            ${selection.has(book.contentId) ? "checked" : ""}
            ${batchDownloading ? "disabled" : ""}
          >
          <div class="book-cover ${book.coverUrl ? "" : "is-missing"}">
            ${
              book.coverUrl
                ? `<img src="${escapeHtml(book.coverUrl)}" alt="${escapeHtml(book.title)}封面" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
                : ""
            }
            <span>暂无封面</span>
          </div>
          <div class="result-copy">
            <h3>${escapeHtml(book.title)}</h3>
            <p>${escapeHtml(formatBookMeta(book))}</p>
          </div>
          <button
            type="button"
            class="download-book"
            data-content-id="${escapeHtml(book.contentId)}"
            ${batchDownloading ? "disabled" : ""}
          >
            下载
          </button>
        </article>
      `
    )
    .join("");
}

function updateSelectionControls(visibleBooks: BookItem[]): void {
  const catalogPanel = document.querySelector<HTMLElement>("#catalogPanel");
  if (!catalogPanel) {
    return;
  }

  for (const checkbox of catalogPanel.querySelectorAll<HTMLInputElement>("input[data-select-content-id]")) {
    const contentId = checkbox.dataset.selectContentId;
    checkbox.checked = Boolean(contentId && selection.has(contentId));
    checkbox.disabled = batchDownloading;
  }

  const visibleIds = visibleBooks.map((book) => book.contentId);
  const selectedVisible = visibleIds.filter((contentId) => selection.has(contentId)).length;
  const selectVisible = catalogPanel.querySelector<HTMLInputElement>("#selectVisible");
  if (selectVisible) {
    selectVisible.checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
    selectVisible.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
    selectVisible.disabled = batchDownloading || visibleIds.length === 0;
  }

  const selectionCount = catalogPanel.querySelector<HTMLElement>("#selectionCount");
  if (selectionCount) {
    selectionCount.textContent = `已选 ${selection.size} 本`;
  }

  const clearButton = catalogPanel.querySelector<HTMLButtonElement>("#clearSelected");
  if (clearButton) {
    clearButton.disabled = batchDownloading || selection.size === 0;
  }

  const downloadButton = catalogPanel.querySelector<HTMLButtonElement>("#downloadSelected");
  if (downloadButton) {
    downloadButton.disabled = batchDownloading || selection.size === 0;
    downloadButton.textContent = batchDownloading ? "处理中..." : `下载所选 (${selection.size})`;
  }

  for (const button of catalogPanel.querySelectorAll<HTMLButtonElement>(".download-book")) {
    button.disabled = batchDownloading;
  }

  for (const select of catalogPanel.querySelectorAll<HTMLSelectElement>("select[data-filter]")) {
    select.disabled = batchDownloading;
  }

  const reloadButton = catalogPanel.querySelector<HTMLButtonElement>("#reloadCatalog");
  if (reloadButton) {
    reloadButton.disabled = batchDownloading;
  }

  for (const image of catalogPanel.querySelectorAll<HTMLImageElement>(".book-cover img")) {
    if (image.dataset.errorBound === "true") {
      continue;
    }
    image.dataset.errorBound = "true";
    image.addEventListener(
      "error",
      () => {
        image.hidden = true;
        image.parentElement?.classList.add("is-missing");
      },
      { once: true }
    );
  }
}

async function downloadCurrentTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url) {
    setMessage("没有找到当前标签页 URL。");
    return;
  }

  if (!tab.url.startsWith("https://basic.smartedu.cn/tchMaterial/detail")) {
    setMessage("请先切换到智慧教育平台的课本详情页。");
    return;
  }

  const button = getButton("#downloadCurrent");
  button.disabled = true;
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
    button.disabled = false;
  }
}

async function downloadBook(book: BookItem, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  setMessage(`正在解析：${book.title}`);

  try {
    const response = (await chrome.runtime.sendMessage({
      type: "downloadResource",
      contentId: book.contentId,
      contentType: book.contentType
    })) as DownloadResourceResponse;

    if (!response.ok) {
      throw new Error(response.error ?? "下载失败。");
    }

    setMessage(response.filename ? `已开始下载：${response.filename}` : "已开始下载。");
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error));
  } finally {
    button.disabled = false;
  }
}

async function downloadSelectedBooks(visibleBooks: BookItem[]): Promise<void> {
  const selectedBooks = books.filter((book) => selection.has(book.contentId));
  if (selectedBooks.length === 0 || batchDownloading) {
    return;
  }

  batchDownloading = true;
  updateSelectionControls(visibleBooks);
  const jobId = crypto.randomUUID();

  const progressListener = (message: BatchDownloadProgressMessage): void => {
    if (message.type !== "batchDownloadProgress" || message.jobId !== jobId) {
      return;
    }

    setMessage(
      `正在处理 ${message.completed}/${message.total}：已开始 ${message.succeeded} 本，失败 ${message.failed} 本。`
    );
  };
  chrome.runtime.onMessage.addListener(progressListener);

  try {
    setMessage(`正在处理 ${selectedBooks.length} 本课本...`);
    const response = (await chrome.runtime.sendMessage({
      type: "downloadResources",
      jobId,
      resources: selectedBooks.map((book) => ({
        contentId: book.contentId,
        contentType: book.contentType
      }))
    })) as DownloadResourcesResponse;

    if (!response.ok) {
      throw new Error(response.error ?? "批量下载失败。");
    }

    const results = response.results ?? [];
    const succeeded = results.filter((result) => result.ok);
    const failed = results.filter((result) => !result.ok);
    selection.deleteMany(succeeded.map((result) => result.contentId));

    if (failed.length === 0) {
      setMessage(`已开始下载 ${succeeded.length} 本课本。`);
    } else {
      const firstFailed = books.find((book) => book.contentId === failed[0].contentId);
      setMessage(
        `已开始 ${succeeded.length} 本，失败 ${failed.length} 本。${firstFailed ? `首个失败：${firstFailed.title}` : "失败项已保留，可重试。"}`
      );
    }
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error));
  } finally {
    chrome.runtime.onMessage.removeListener(progressListener);
    batchDownloading = false;
    renderCatalogBrowser();
  }
}

async function getTokenStatus(): Promise<TokenStatusResponse> {
  return (await chrome.runtime.sendMessage({
    type: "getTokenStatus"
  })) as TokenStatusResponse;
}

async function recoverToken(): Promise<TokenStatusResponse> {
  tokenStatus.textContent = "正在同步智慧教育平台登录状态...";
  return (await chrome.runtime.sendMessage({
    type: "recoverToken"
  })) as TokenStatusResponse;
}

async function openLoginPage(): Promise<void> {
  await chrome.runtime.sendMessage({ type: "openLoginPage" });
  setMessage("已打开登录页。登录完成后重新打开此面板即可使用下载功能。");
}

async function clearSavedToken(): Promise<void> {
  await chrome.runtime.sendMessage({ type: "clearToken" });
  setMessage("已清除当前会话中的 Access Token。");
  renderLoggedOut();
}

function getOptionsFor(key: FilterKey): string[] {
  const scopedBooks = books.filter((book) => {
    return FILTER_KEYS.every((filterKey) => {
      if (filterKey === key) {
        return true;
      }

      const selectedValue = filters[filterKey];
      return !selectedValue || getBookFilterValue(book, filterKey) === selectedValue;
    });
  });
  const seen = new Set<string>();
  const options: string[] = [];

  for (const book of scopedBooks) {
    const value = getBookFilterValue(book, key);
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    options.push(value);
  }

  return options;
}

function normalizeFilters(nextFilters: Record<FilterKey, string>): Record<FilterKey, string> {
  const normalized = { ...nextFilters };
  let changed = true;

  while (changed) {
    changed = false;
    for (const key of FILTER_KEYS) {
      if (!normalized[key]) {
        continue;
      }

      const available = getOptionsForWithFilters(key, normalized);
      if (!available.includes(normalized[key])) {
        normalized[key] = "";
        changed = true;
      }
    }
  }

  return normalized;
}

function getOptionsForWithFilters(
  key: FilterKey,
  scopedFilters: Record<FilterKey, string>
): string[] {
  const seen = new Set<string>();
  const options: string[] = [];

  for (const book of books) {
    const matchesOtherFilters = FILTER_KEYS.every((filterKey) => {
      if (filterKey === key) {
        return true;
      }

      const selectedValue = scopedFilters[filterKey];
      return !selectedValue || getBookFilterValue(book, filterKey) === selectedValue;
    });

    if (!matchesOtherFilters) {
      continue;
    }

    const value = getBookFilterValue(book, key);
    if (value && !seen.has(value)) {
      seen.add(value);
      options.push(value);
    }
  }

  return options;
}

function matchesFilters(book: BookItem): boolean {
  return FILTER_KEYS.every((key) => !filters[key] || getBookFilterValue(book, key) === filters[key]);
}

function getBookFilterValue(book: BookItem, key: FilterKey): string {
  if (key === "volume") {
    return book.volume ?? "其他册次";
  }

  return book[key] ?? "";
}

function formatBookMeta(book: BookItem): string {
  return FILTER_KEYS.map((key) => getBookFilterValue(book, key)).filter(Boolean).join(" / ");
}

function formatCatalogMeta(): string {
  const source = catalogMeta.fromCache ? "本地缓存" : "平台目录";
  const updatedAt = catalogMeta.updatedAt ? `，${formatDate(catalogMeta.updatedAt)}` : "";
  return `${books.length} 本课本，来自${source}${updatedAt}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN");
}

function createEmptyFilters(): Record<FilterKey, string> {
  return {
    stage: "",
    subject: "",
    grade: "",
    publisher: "",
    volume: ""
  };
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}
