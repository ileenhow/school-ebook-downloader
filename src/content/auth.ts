import { readSmartEduCredential } from "../shared/auth-token";
import type { ExtensionRequest } from "../shared/messages";

const POLL_INTERVAL_MS = 1000;
const MAX_ATTEMPTS = 600;
const CAPTURE_FLAG = "__schoolEbookDownloaderAuthCapture";

type AuthWindow = Window &
  typeof globalThis & {
    [CAPTURE_FLAG]?: boolean;
  };

export function startAuthCredentialCapture(): void {
  const authWindow = window as AuthWindow;
  if (authWindow[CAPTURE_FLAG]) {
    return;
  }

  authWindow[CAPTURE_FLAG] = true;
  void captureCredentialWhenAvailable();
}

async function captureCredentialWhenAvailable(): Promise<void> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const credential = readSmartEduCredential(localStorage);

    if (credential) {
      await chrome.runtime.sendMessage({
        type: "saveCredential",
        credential,
        source: "auth-page"
      } satisfies ExtensionRequest);
      return;
    }

    await wait(POLL_INTERVAL_MS);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
