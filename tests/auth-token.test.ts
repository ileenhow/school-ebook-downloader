import { describe, expect, it } from "vitest";
import { readSmartEduAccessToken } from "../src/shared/auth-token";

describe("readSmartEduAccessToken", () => {
  it("reads a SmartEdu access token from the matching storage entry", () => {
    const storage = createStorage({
      "ND_UC_AUTH:current": JSON.stringify({
        value: JSON.stringify({ access_token: "session-token" })
      })
    });

    expect(readSmartEduAccessToken(storage)).toBe("session-token");
  });

  it("ignores unrelated, malformed, or empty entries", () => {
    expect(readSmartEduAccessToken(createStorage({ other: "value" }))).toBeUndefined();
    expect(
      readSmartEduAccessToken(createStorage({ "ND_UC_AUTH:current": "not-json" }))
    ).toBeUndefined();
    expect(
      readSmartEduAccessToken(
        createStorage({
          "ND_UC_AUTH:current": JSON.stringify({
            value: JSON.stringify({ access_token: "  " })
          })
        })
      )
    ).toBeUndefined();
  });
});

function createStorage(values: Record<string, string>): Storage {
  const storage = window.localStorage;
  storage.clear();
  Object.entries(values).forEach(([key, value]) => storage.setItem(key, value));
  return storage;
}
