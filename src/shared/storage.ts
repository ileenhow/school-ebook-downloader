import type { SmartEduCredential } from "./auth-token";

const CREDENTIAL_KEY = "smarteduCredential";
const CREDENTIAL_UPDATED_AT_KEY = "smarteduCredentialUpdatedAt";
const LEGACY_TOKEN_KEYS = ["smarteduAccessToken", "smarteduAccessTokenUpdatedAt"];

export async function getCredential(): Promise<SmartEduCredential | undefined> {
  const result = await chrome.storage.session.get(CREDENTIAL_KEY);
  const value = result[CREDENTIAL_KEY];
  return isStoredCredential(value) ? value : undefined;
}

export async function saveCredential(credential: SmartEduCredential): Promise<void> {
  if (!isStoredCredential(credential)) {
    throw new Error("智慧教育平台授权凭据不完整。");
  }

  await chrome.storage.session.set({
    [CREDENTIAL_KEY]: credential,
    [CREDENTIAL_UPDATED_AT_KEY]: new Date().toISOString()
  });
  await chrome.storage.session.remove(LEGACY_TOKEN_KEYS);
}

export async function clearCredential(): Promise<void> {
  await chrome.storage.session.remove([
    CREDENTIAL_KEY,
    CREDENTIAL_UPDATED_AT_KEY,
    ...LEGACY_TOKEN_KEYS
  ]);
}

export async function getTokenStatus(): Promise<{
  hasToken: boolean;
  updatedAt?: string;
}> {
  const result = await chrome.storage.session.get([
    CREDENTIAL_KEY,
    CREDENTIAL_UPDATED_AT_KEY
  ]);
  const updatedAt = result[CREDENTIAL_UPDATED_AT_KEY];

  return {
    hasToken: isStoredCredential(result[CREDENTIAL_KEY]),
    updatedAt: typeof updatedAt === "string" ? updatedAt : undefined
  };
}

function isStoredCredential(value: unknown): value is SmartEduCredential {
  if (!value || typeof value !== "object") {
    return false;
  }

  const credential = value as Partial<SmartEduCredential>;
  return (
    typeof credential.accessToken === "string" &&
    credential.accessToken.trim().length > 0 &&
    typeof credential.macKey === "string" &&
    credential.macKey.trim().length > 0 &&
    typeof credential.clockDiff === "number" &&
    Number.isFinite(credential.clockDiff)
  );
}
