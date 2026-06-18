import type { BookItem } from "../shared/catalog";
import type {
  CatalogResponse,
  DownloadCurrentPageResponse,
  DownloadResourceResponse,
  TokenStatusResponse
} from "../shared/messages";
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

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <section class="shell">
    <header class="header">
      <div>
        <p class="eyebrow">SmartEdu</p>
        <h1>课本下载助手</h1>
      </div>
      <span class="badge" id="tokenBadge">读取中</span>
    </header>

    <div class="status" id="tokenStatus">正在读取授权状态...</div>
    <main id="panel"></main>
    <p class="message" id="message" aria-live="polite"></p>
  </section>
`;

const tokenBadge = getElement("#tokenBadge");
const tokenStatus = getElement("#tokenStatus");
const panel = getElement("#panel");
const message = getElement("#message");

void initialize();

async function initialize(): Promise<void> {
  setMessage("");

  try {
    const status = await getTokenStatus();
    if (status.ok && status.hasToken) {
      renderLoggedIn(status);
      await loadCatalog();
      return;
    }

    renderLoggedOut(status);
  } catch (error) {
    tokenBadge.textContent = "异常";
    tokenStatus.textContent = "授权状态读取失败。";
    renderLoggedOutActions();
    setMessage(error instanceof Error ? error.message : String(error));
  }
}

function renderLoggedOut(status?: TokenStatusResponse): void {
  tokenBadge.textContent = "未登录";
  tokenStatus.textContent = status?.updatedAt
    ? `当前会话没有可用 Access Token。上次捕获：${formatDate(status.updatedAt)}`
    : "当前会话没有可用 Access Token。";
  books = [];
  filters = createEmptyFilters();
  catalogMeta = {};
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
  tokenBadge.textContent = "已登录";
  tokenStatus.textContent = `已捕获 Access Token${formatUpdatedAt(status.updatedAt)}`;
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
          <div class="result-copy">
            <h3>${escapeHtml(book.title)}</h3>
            <p>${escapeHtml(formatBookMeta(book))}</p>
          </div>
          <button
            type="button"
            class="download-book"
            data-content-id="${escapeHtml(book.contentId)}"
          >
            下载
          </button>
        </article>
      `
    )
    .join("");
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

async function getTokenStatus(): Promise<TokenStatusResponse> {
  return (await chrome.runtime.sendMessage({
    type: "getTokenStatus"
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

function formatUpdatedAt(updatedAt?: string): string {
  return updatedAt ? `，${formatDate(updatedAt)}` : "";
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
