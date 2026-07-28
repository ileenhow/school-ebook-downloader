import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backgroundPath = resolve(projectRoot, "dist/assets/background.js");

if (!existsSync(backgroundPath)) {
  throw new Error("dist/assets/background.js 不存在，请先运行 pnpm build。");
}

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
      get: async () => ({ smarteduAccessToken: "security-test-token" }),
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
assert.deepEqual(downloads[0].headers, [
  {
    name: "X-ND-AUTH",
    value: 'MAC id="security-test-token",nonce="0",mac="0"'
  }
]);

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
