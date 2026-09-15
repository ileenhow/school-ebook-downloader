import { describe, expect, it } from "vitest";
import { readSmartEduCredential } from "../src/shared/auth-token";

describe("readSmartEduCredential", () => {
  it("reads the three fields required for MAC authentication", () => {
    const storage = createStorage({
      "ND_UC_AUTH-app&org&token": JSON.stringify({
        value: JSON.stringify({
          access_token: "session-token",
          mac_key: "session-mac-key",
          diff: "1250"
        })
      })
    });

    expect(readSmartEduCredential(storage)).toEqual({
      accessToken: "session-token",
      macKey: "session-mac-key",
      clockDiff: 1250
    });
  });

  it("does not mistake the SDK cache for the token entry", () => {
    const storage = createStorage({
      "ND_UC_AUTH-app&org&sdk_cache": JSON.stringify({
        value: JSON.stringify({
          access_token: "cache-token",
          mac_key: "cache-mac-key",
          diff: 0
        })
      })
    });

    expect(readSmartEduCredential(storage)).toBeUndefined();
  });

  it("ignores credentials whose storage wrapper has expired", () => {
    const storage = createStorage({
      "ND_UC_AUTH-app&org&token": JSON.stringify({
        value: JSON.stringify({
          access_token: "expired-token",
          mac_key: "expired-mac-key",
          diff: 0
        }),
        expire: Date.now() - 1
      })
    });

    expect(readSmartEduCredential(storage)).toBeUndefined();
  });

  it("ignores malformed or incomplete credentials", () => {
    expect(
      readSmartEduCredential(createStorage({ "ND_UC_AUTH-app&org&token": "not-json" }))
    ).toBeUndefined();
    expect(
      readSmartEduCredential(
        createStorage({
          "ND_UC_AUTH-app&org&token": JSON.stringify({
            value: JSON.stringify({ access_token: "token-without-mac-key", diff: 0 })
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
