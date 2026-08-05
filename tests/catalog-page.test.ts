import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogPageController, extractContentIdFromCoverUrl } from "../src/content/catalog-page";
import type { BookItem } from "../src/shared/catalog";

const book: BookItem = {
  contentId: "bdc00134-465d-454b-a541-dcd0cec4d86e",
  contentType: "assets_document",
  title: "测试课本",
  coverUrl:
    "https://r2-ndr.ykt.cbern.com.cn/edu_product/esp/assets/bdc00134-465d-454b-a541-dcd0cec4d86e.t/zh-CN/transcode/image/1.jpg"
};

let controller: CatalogPageController | undefined;

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

afterEach(() => {
  controller?.destroy();
  controller = undefined;
});

describe("SmartEdu catalog page injection", () => {
  it("extracts a content ID from a SmartEdu cover URL", () => {
    expect(extractContentIdFromCoverUrl(book.coverUrl!)).toBe(book.contentId);
    expect(extractContentIdFromCoverUrl("https://example.com/cover.jpg")).toBeUndefined();
  });

  it("injects one button per matched card and prevents the card click", async () => {
    const card = createCard(book.coverUrl!);
    document.body.append(card);
    let cardClicks = 0;
    card.addEventListener("click", () => {
      cardClicks += 1;
    });

    const sendMessage = vi.fn(async (message: unknown) => {
      const request = message as { type?: string };
      return request.type === "getCatalog"
        ? { ok: true, books: [book] }
        : { ok: true, filename: "测试课本.pdf", downloadId: 1 };
    });
    controller = new CatalogPageController(document, sendMessage);
    await controller.start(true);
    controller.scanNow();

    const buttons = card.querySelectorAll<HTMLButtonElement>(
      ".school-ebook-downloader-card-button"
    );
    expect(buttons).toHaveLength(1);
    buttons[0].click();
    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: "downloadResource",
        contentId: book.contentId,
        contentType: book.contentType
      });
    });
    expect(cardClicks).toBe(0);
  });

  it("does not show buttons while logged out and removes them when authorization is cleared", async () => {
    const card = createCard(book.coverUrl!);
    document.body.append(card);
    const sendMessage = vi.fn(async () => ({ ok: true, books: [book] }));
    controller = new CatalogPageController(document, sendMessage);

    await controller.start(false);
    expect(card.querySelector(".school-ebook-downloader-card-button")).toBeNull();

    await controller.setHasToken(true);
    expect(card.querySelector(".school-ebook-downloader-card-button")).not.toBeNull();

    await controller.setHasToken(false);
    expect(card.querySelector(".school-ebook-downloader-card-button")).toBeNull();
  });

  it("rescans cards added by a React-style redraw without duplicating existing buttons", async () => {
    const sendMessage = vi.fn(async () => ({ ok: true, books: [book] }));
    controller = new CatalogPageController(document, sendMessage);
    await controller.start(true);

    const card = createCard(book.coverUrl!);
    document.body.append(card);
    await vi.waitFor(
      () => {
        expect(card.querySelectorAll(".school-ebook-downloader-card-button")).toHaveLength(1);
      },
      { timeout: 500 }
    );

    controller.scanNow();
    expect(card.querySelectorAll(".school-ebook-downloader-card-button")).toHaveLength(1);
  });
});

function createCard(coverUrl: string): HTMLLIElement {
  const card = document.createElement("li");
  card.className = "index-module_items_currentHash";
  card.innerHTML = `
    <div class="index-module_cover_wrapper_currentHash">
      <img src="${coverUrl}" alt="测试课本封面">
    </div>
    <div class="index-module_content_currentHash">
      <span>测试课本</span>
    </div>
  `;
  return card;
}
