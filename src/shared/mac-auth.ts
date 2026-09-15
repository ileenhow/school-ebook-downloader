import type { SmartEduCredential } from "./auth-token";

const NONCE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

type AuthorizationOptions = {
  method?: string;
  nonce?: string;
  now?: number;
};

export async function createSmartEduAuthorization(
  requestUrl: string,
  credential: SmartEduCredential,
  options: AuthorizationOptions = {}
): Promise<string> {
  const url = new URL(requestUrl);
  const method = (options.method ?? "GET").toUpperCase();
  const nonce = options.nonce ?? createNonce(options.now ?? Date.now(), credential.clockDiff);
  const relativeUrl = `${decodeURIComponent(url.pathname)}${url.search}`;
  const normalizedRequest = `${nonce}\n${method}\n${relativeUrl}\n${url.hostname}\n`;
  const mac = await signHmacSha256(normalizedRequest, credential.macKey);

  return `MAC id="${credential.accessToken}",nonce="${nonce}",mac="${mac}"`;
}

function createNonce(now: number, clockDiff: number): string {
  const randomValues = new Uint8Array(8);
  crypto.getRandomValues(randomValues);
  const randomPart = Array.from(
    randomValues,
    (value) => NONCE_ALPHABET[value % NONCE_ALPHABET.length]
  ).join("");

  return `${now + clockDiff}:${randomPart}`;
}

async function signHmacSha256(message: string, macKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(macKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(message))
  );

  let binary = "";
  for (const byte of signature) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
