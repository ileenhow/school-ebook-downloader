import { describe, expect, it } from "vitest";
import { createSmartEduAuthorization } from "../src/shared/mac-auth";

describe("createSmartEduAuthorization", () => {
  it("matches the SmartEdu MAC HMAC-SHA256 request format", async () => {
    const authorization = await createSmartEduAuthorization(
      "https://r1-ndr-private.ykt.cbern.com.cn/edu_product/esp/assets/book.pkg/%E8%8B%B1%E8%AF%AD.pdf?version=1",
      {
        accessToken: "access-token",
        macKey: "mac-secret",
        clockDiff: 123
      },
      { nonce: "1700000000123:ABCDEFGH" }
    );

    expect(authorization).toBe(
      'MAC id="access-token",nonce="1700000000123:ABCDEFGH",mac="5HCcP27MrUo0QD9drE2EuEibSkHShg9rm7PsyngJTXM="'
    );
  });

  it("uses the decoded path, query, method, and hostname without the port", async () => {
    const withPort = await createSmartEduAuthorization(
      "https://example.test:8443/file.pdf",
      {
        accessToken: "access-token",
        macKey: "mac-secret",
        clockDiff: 0
      },
      { method: "head", nonce: "nonce" }
    );
    const withoutPort = await createSmartEduAuthorization(
      "https://example.test/file.pdf",
      {
        accessToken: "access-token",
        macKey: "mac-secret",
        clockDiff: 0
      },
      { method: "head", nonce: "nonce" }
    );

    expect(withPort).toBe(withoutPort);
    expect(withPort).toMatch(/^MAC id="access-token",nonce="nonce",mac="[^"]+"$/u);
  });
});
