const AUTH_KEY_PREFIX = "ND_UC_AUTH";

export function readSmartEduAccessToken(storage: Storage): string | undefined {
  try {
    const authKey = Object.keys(storage).find((key) => key.startsWith(AUTH_KEY_PREFIX));
    if (!authKey) {
      return undefined;
    }

    const tokenDataRaw = storage.getItem(authKey);
    if (!tokenDataRaw) {
      return undefined;
    }

    const tokenData = JSON.parse(tokenDataRaw) as { value?: unknown };
    if (typeof tokenData.value !== "string") {
      return undefined;
    }

    const value = JSON.parse(tokenData.value) as { access_token?: unknown };
    return typeof value.access_token === "string" && value.access_token.trim()
      ? value.access_token
      : undefined;
  } catch {
    return undefined;
  }
}
