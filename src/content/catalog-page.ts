import type { BookItem } from "../shared/catalog";
import type {
  CatalogResponse,
  DownloadResourceResponse
} from "../shared/messages";

const CARD_SELECTOR = 'li[class*="index-module_items_"]';
const CONTENT_SELECTOR = '[class*="index-module_content_"]';
const COVER_IMAGE_SELECTOR = '[class*="index-module_cover_wrapper_"] img';
const BUTTON_CLASS = "school-ebook-downloader-card-button";
const STYLE_ID = "school-ebook-downloader-card-style";
const SCAN_DELAY_MS = 80;

type SendRuntimeMessage = (message: unknown) => Promise<unknown>;

export class CatalogPageController {
  readonly #document: Document;
  readonly #sendMessage: SendRuntimeMessage;
  #booksById = new Map<string, BookItem>();
  #catalogPromise: Promise<void> | undefined;
  #hasToken = false;
  #observer: MutationObserver | undefined;
  #scanTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(document: Document, sendMessage: SendRuntimeMessage) {
    this.#document = document;
    this.#sendMessage = sendMessage;
  }

  async start(hasToken: boolean): Promise<void> {
    this.#observePage();
    await this.setHasToken(hasToken);
  }

  async setHasToken(hasToken: boolean): Promise<void> {
    this.#hasToken = hasToken;
    if (!hasToken) {
      this.#removeButtons();
      return;
    }

    try {
      await this.#ensureCatalog();
      this.scanNow();
    } catch (error) {
      console.warn("课本下载助手无法加载教材目录：", error);
    }
  }

  scanNow(): void {
    if (!this.#hasToken || this.#booksById.size === 0) {
      return;
    }

    this.#ensureStyle();
    for (const card of this.#document.querySelectorAll<HTMLElement>(CARD_SELECTOR)) {
      const existingButton = card.querySelector<HTMLButtonElement>(`.${BUTTON_CLASS}`);
      const book = this.#findBookForCard(card);
      if (!book) {
        existingButton?.remove();
        continue;
      }

      if (existingButton?.dataset.contentId === book.contentId) {
        continue;
      }

      existingButton?.remove();
      this.#injectButton(card, book);
    }
  }

  destroy(): void {
    this.#observer?.disconnect();
    this.#observer = undefined;
    if (this.#scanTimer !== undefined) {
      clearTimeout(this.#scanTimer);
      this.#scanTimer = undefined;
    }
    this.#removeButtons();
  }

  async #ensureCatalog(): Promise<void> {
    if (this.#booksById.size > 0) {
      return;
    }

    this.#catalogPromise ??= this.#loadCatalog();
    try {
      await this.#catalogPromise;
    } catch (error) {
      this.#catalogPromise = undefined;
      throw error;
    }
  }

  async #loadCatalog(): Promise<void> {
    const response = (await this.#sendMessage({ type: "getCatalog" })) as CatalogResponse;
    if (!response.ok) {
      throw new Error(response.error ?? "教材目录加载失败。");
    }

    this.#booksById = new Map((response.books ?? []).map((book) => [book.contentId, book]));
  }

  #observePage(): void {
    if (this.#observer) {
      return;
    }

    const MutationObserverConstructor = this.#document.defaultView?.MutationObserver;
    if (!MutationObserverConstructor) {
      return;
    }

    this.#observer = new MutationObserverConstructor(() => {
      if (!this.#hasToken || this.#scanTimer !== undefined) {
        return;
      }

      this.#scanTimer = setTimeout(() => {
        this.#scanTimer = undefined;
        this.scanNow();
      }, SCAN_DELAY_MS);
    });
    this.#observer.observe(this.#document.documentElement, { childList: true, subtree: true });
  }

  #findBookForCard(card: HTMLElement): BookItem | undefined {
    const images = [
      ...card.querySelectorAll<HTMLImageElement>(COVER_IMAGE_SELECTOR),
      ...card.querySelectorAll<HTMLImageElement>("img")
    ];

    for (const image of images) {
      const contentId = extractContentIdFromCoverUrl(image.currentSrc || image.src);
      const book = contentId ? this.#booksById.get(contentId) : undefined;
      if (book) {
        return book;
      }
    }

    return undefined;
  }

  #injectButton(card: HTMLElement, book: BookItem): void {
    const button = this.#document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.dataset.contentId = book.contentId;
    button.textContent = "下载 PDF";
    button.setAttribute("aria-label", `下载 ${book.title} PDF`);

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.#downloadBook(button, book);
    });

    const content = card.querySelector<HTMLElement>(CONTENT_SELECTOR) ?? card;
    content.append(button);
  }

  async #downloadBook(button: HTMLButtonElement, book: BookItem): Promise<void> {
    if (!this.#hasToken) {
      button.remove();
      return;
    }

    button.disabled = true;
    button.textContent = "正在解析...";
    button.removeAttribute("title");

    try {
      const response = (await this.#sendMessage({
        type: "downloadResource",
        contentId: book.contentId,
        contentType: book.contentType
      })) as DownloadResourceResponse;

      if (!response.ok) {
        throw new Error(response.error ?? "下载失败。");
      }

      button.textContent = "已开始下载";
      setTimeout(() => {
        if (button.isConnected && this.#hasToken) {
          button.disabled = false;
          button.textContent = "下载 PDF";
        }
      }, 1800);
    } catch (error) {
      button.disabled = false;
      button.textContent = "重试下载";
      button.title = error instanceof Error ? error.message : String(error);
    }
  }

  #ensureStyle(): void {
    if (this.#document.getElementById(STYLE_ID)) {
      return;
    }

    const style = this.#document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${BUTTON_CLASS} {
        appearance: none !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 96px !important;
        min-width: 96px !important;
        height: 34px !important;
        margin-top: 12px !important;
        padding: 0 12px !important;
        border: 0 !important;
        border-radius: 4px !important;
        background: #1769aa !important;
        color: #ffffff !important;
        cursor: pointer !important;
        font: 600 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        letter-spacing: 0 !important;
        white-space: nowrap !important;
      }

      .${BUTTON_CLASS}:hover:not(:disabled) {
        background: #0f568e !important;
      }

      .${BUTTON_CLASS}:disabled {
        cursor: default !important;
        opacity: 0.68 !important;
      }
    `;
    this.#document.documentElement.append(style);
  }

  #removeButtons(): void {
    for (const button of this.#document.querySelectorAll(`.${BUTTON_CLASS}`)) {
      button.remove();
    }
  }
}

export function extractContentIdFromCoverUrl(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }

  const match = url.pathname.match(/\/assets\/([^/]+)\.t\//u);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}
