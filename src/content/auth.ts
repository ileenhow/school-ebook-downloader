import type { ExtensionRequest } from "../shared/messages";

const AUTH_KEY_PREFIX = "ND_UC_AUTH";
const POLL_INTERVAL_MS = 1000;
const MAX_ATTEMPTS = 600;

void captureTokenWhenAvailable();

async function captureTokenWhenAvailable(): Promise<void> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const token = readAccessTokenFromLocalStorage();

    if (token) {
      await chrome.runtime.sendMessage({
        type: "saveToken",
        token,
        source: "auth-page"
      } satisfies ExtensionRequest);
      return;
    }

    await wait(POLL_INTERVAL_MS);
  }
}

function readAccessTokenFromLocalStorage(): string | undefined {
  try {
    const authKey = Object.keys(localStorage).find((key) => key.startsWith(AUTH_KEY_PREFIX));
    if (!authKey) {
      return undefined;
    }

    const tokenDataRaw = localStorage.getItem(authKey);
    if (!tokenDataRaw) {
      return undefined;
    }

    const tokenData = JSON.parse(tokenDataRaw) as { value?: string };
    if (!tokenData.value) {
      return undefined;
    }

    const value = JSON.parse(tokenData.value) as { access_token?: string };
    return value.access_token;
  } catch {
    return undefined;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
