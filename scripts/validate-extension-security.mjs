import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backgroundPath = resolve(projectRoot, "dist/assets/background.js");
const contentPath = resolve(projectRoot, "dist/assets/content.js");

if (!existsSync(backgroundPath)) {
  throw new Error("dist/assets/background.js 不存在，请先运行 pnpm build。");
}
if (!existsSync(contentPath)) {
  throw new Error("dist/assets/content.js 不存在，请先运行 pnpm build。");
}

assert.doesNotMatch(
  readFileSync(contentPath, "utf8"),
  /^\s*(?:import|export)\b/mu,
  "静态 content script 必须是自包含脚本，不能包含 ESM import/export"
);

let messageListener;
let nextDownloadUrl = "";
const downloads = [];

globalThis.chrome = {
  downloads: {
    download: async (options) => {
      downloads.push(options);
      return downloads.length;
    }
  },
  runtime: {
    onMessage: {
      addListener: (listener) => {
        messageListener = listener;
      }
    }
  },
  storage: {
    local: {
      get: async () => ({}),
      set: async () => undefined
    },
    session: {
      get: async () => ({
        smarteduCredential: {
          accessToken: "security-test-token",
          macKey: "security-test-mac-key",
          clockDiff: 0
        }
      }),
      remove: async () => undefined,
      set: async () => undefined
    }
  },
  tabs: {
    create: async () => undefined,
    query: async () => [],
    sendMessage: async () => undefined
  }
};

globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    title: "Security test",
    ti_items: [
      {
        ti_is_source_file: true,
        ti_storage: nextDownloadUrl
      }
    ]
  })
});

await import(`${pathToFileURL(backgroundPath).href}?security-check=${Date.now()}`);
assert.equal(typeof messageListener, "function", "background message listener was not registered");

await assertBlocked("https://attacker.example/textbook.pdf");
await assertBlocked("https://ykt.cbern.com.cn.attacker.example/textbook.pdf");
await assertBlocked("http://r1-ndr-private.ykt.cbern.com.cn/textbook.pdf");
await assertBlocked("https://r1-ndr-private.ykt.cbern.com.cn:8443/textbook.pdf");
await assertBlocked("https://user:password@r1-ndr-private.ykt.cbern.com.cn/textbook.pdf");

nextDownloadUrl = "https://r1-ndr-private.ykt.cbern.com.cn/textbook.pdf";
const allowedResponse = await sendDownloadRequest();
assert.equal(allowedResponse.ok, true);
assert.equal(downloads.length, 1);
assert.equal(downloads[0].url, nextDownloadUrl);
assert.equal(downloads[0].headers.length, 1);
assert.equal(downloads[0].headers[0].name, "X-ND-AUTH");
assert.match(
  downloads[0].headers[0].value,
  /^MAC id="security-test-token",nonce="\d+:[0-9A-Z]{8}",mac="[A-Za-z0-9+/]+=*"$/u
);
assert.doesNotMatch(downloads[0].headers[0].value, /nonce="0"/u);

console.log("扩展下载域名与授权头安全检查通过。");

async function assertBlocked(downloadUrl) {
  nextDownloadUrl = downloadUrl;
  const response = await sendDownloadRequest();
  assert.equal(response.ok, false);
  assert.match(response.error, /已阻止/u);
  assert.equal(downloads.length, 0);
}

function sendDownloadRequest() {
  return new Promise((resolvePromise) => {
    const keepChannelOpen = messageListener(
      {
        type: "downloadResource",
        contentId: "security-test",
        contentType: "assets_document"
      },
      {},
      resolvePromise
    );

    assert.equal(keepChannelOpen, true);
  });
}
