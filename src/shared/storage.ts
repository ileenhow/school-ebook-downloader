const TOKEN_KEY = "smarteduAccessToken";
const TOKEN_UPDATED_AT_KEY = "smarteduAccessTokenUpdatedAt";

export async function getAccessToken(): Promise<string | undefined> {
  const result = await chrome.storage.session.get(TOKEN_KEY);
  const value = result[TOKEN_KEY];
  return typeof value === "string" && value.trim() ? value : undefined;
}

export async function saveAccessToken(token: string): Promise<void> {
  await chrome.storage.session.set({
    [TOKEN_KEY]: token,
    [TOKEN_UPDATED_AT_KEY]: new Date().toISOString()
  });
}

export async function clearAccessToken(): Promise<void> {
  await chrome.storage.session.remove([TOKEN_KEY, TOKEN_UPDATED_AT_KEY]);
}

export async function getTokenStatus(): Promise<{
  hasToken: boolean;
  updatedAt?: string;
}> {
  const result = await chrome.storage.session.get([TOKEN_KEY, TOKEN_UPDATED_AT_KEY]);
  const token = result[TOKEN_KEY];
  const updatedAt = result[TOKEN_UPDATED_AT_KEY];

  return {
    hasToken: typeof token === "string" && token.trim().length > 0,
    updatedAt: typeof updatedAt === "string" ? updatedAt : undefined
  };
}

