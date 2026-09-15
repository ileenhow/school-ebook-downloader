import {
  readSmartEduCredential,
  type SmartEduCredential
} from "../shared/auth-token";
import type { ExtensionRequest } from "../shared/messages";

const POLL_INTERVAL_MS = 250;
const MAX_ATTEMPTS = 40;
const UNCHANGED_CREDENTIAL_GRACE_ATTEMPTS = 8;
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
  const initialCredential = readSmartEduCredential(localStorage);
  await waitForPageLoad();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const credential = readSmartEduCredential(localStorage);

    if (
      credential &&
      (!initialCredential ||
        !credentialsMatch(credential, initialCredential) ||
        attempt >= UNCHANGED_CREDENTIAL_GRACE_ATTEMPTS)
    ) {
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

function waitForPageLoad(): Promise<void> {
  if (document.readyState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.addEventListener("load", () => resolve(), { once: true });
  });
}

function credentialsMatch(left: SmartEduCredential, right: SmartEduCredential): boolean {
  return (
    left.accessToken === right.accessToken &&
    left.macKey === right.macKey &&
    left.clockDiff === right.clockDiff
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
