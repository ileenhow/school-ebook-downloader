const AUTH_TOKEN_KEY_PATTERN = /^ND_UC_AUTH-[^&]+&[^&]+&token$/u;

export type SmartEduCredential = {
  accessToken: string;
  macKey: string;
  clockDiff: number;
};

export function readSmartEduCredential(storage: Storage): SmartEduCredential | undefined {
  try {
    const key = Object.keys(storage).find((candidate) => AUTH_TOKEN_KEY_PATTERN.test(candidate));
    const raw = key ? storage.getItem(key) : undefined;
    if (!raw) {
      return undefined;
    }

    const entry = JSON.parse(raw) as { value?: unknown; expire?: unknown };
    if (typeof entry.value !== "string") {
      return undefined;
    }

    const expiresAt = Number(entry.expire);
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      return undefined;
    }

    const value = JSON.parse(entry.value) as Record<string, unknown>;
    const accessToken = readString(value.access_token);
    const macKey = readString(value.mac_key);
    const clockDiff = Number(value.diff);
    if (!accessToken || !macKey || !Number.isFinite(clockDiff)) {
      return undefined;
    }

    return { accessToken, macKey, clockDiff };
  } catch {
    return undefined;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
