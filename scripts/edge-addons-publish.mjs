import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultProjectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultApiBaseUrl = "https://api.addons.microsoftedge.microsoft.com";
const defaultPollIntervalMs = 10_000;
const defaultOperationTimeoutMs = 15 * 60_000;

export async function run({
  args = process.argv.slice(2),
  env = process.env,
  fetchImpl = globalThis.fetch,
  sleep = (delayMs) => new Promise((resolveSleep) => setTimeout(resolveSleep, delayMs)),
  logger = console,
  projectRoot = defaultProjectRoot,
  apiBaseUrl = defaultApiBaseUrl,
  pollIntervalMs = defaultPollIntervalMs,
  operationTimeoutMs = defaultOperationTimeoutMs
} = {}) {
  const noPublish = args.includes("--no-publish");
  const credentials = readRequiredEnv(env, [
    "EDGE_PRODUCT_ID",
    "EDGE_CLIENT_ID",
    "EDGE_API_KEY"
  ]);
  const explicitZipPath = args.find((arg) => !arg.startsWith("--"));
  const zipPath = explicitZipPath
    ? resolve(projectRoot, explicitZipPath)
    : await findDefaultZipPath(projectRoot);
  const productUrl = `${apiBaseUrl}/v1/products/${encodeURIComponent(credentials.EDGE_PRODUCT_ID)}`;
  const headers = {
    Authorization: `ApiKey ${credentials.EDGE_API_KEY}`,
    "X-ClientID": credentials.EDGE_CLIENT_ID
  };

  const packageBuffer = await readFile(zipPath);
  const uploadOperationId = await startOperation({
    fetchImpl,
    url: `${productUrl}/submissions/draft/package`,
    label: "上传 Microsoft Edge Add-ons 扩展包",
    headers: {
      ...headers,
      "Content-Type": "application/zip"
    },
    body: packageBuffer
  });

  await waitForOperation({
    fetchImpl,
    sleep,
    url: `${productUrl}/submissions/draft/package/operations/${encodeURIComponent(uploadOperationId)}`,
    label: "Microsoft Edge Add-ons 扩展包上传",
    headers,
    pollIntervalMs,
    operationTimeoutMs
  });
  logger.log(`已上传扩展包到 Microsoft Edge Add-ons：${zipPath}`);

  if (noPublish) {
    logger.log("跳过 Microsoft Edge Add-ons 提交审核。");
    return;
  }

  const { EDGE_CERTIFICATION_NOTES: certificationNotes } = readRequiredEnv(env, [
    "EDGE_CERTIFICATION_NOTES"
  ]);
  const publishOperationId = await startOperation({
    fetchImpl,
    url: `${productUrl}/submissions`,
    label: "提交 Microsoft Edge Add-ons 审核",
    headers: {
      ...headers,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ notes: certificationNotes })
  });

  await waitForOperation({
    fetchImpl,
    sleep,
    url: `${productUrl}/submissions/operations/${encodeURIComponent(publishOperationId)}`,
    label: "Microsoft Edge Add-ons 提交审核",
    headers,
    pollIntervalMs,
    operationTimeoutMs
  });
  logger.log("已提交 Microsoft Edge Add-ons 审核。");
}

async function findDefaultZipPath(projectRoot) {
  const packageJson = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));
  const releaseDir = resolve(projectRoot, "release");
  const expectedName = `${packageJson.name}-v${packageJson.version}.zip`;
  let entries = [];

  try {
    entries = await readdir(releaseDir);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  if (!entries.includes(expectedName)) {
    throw new Error(`没有找到 ${expectedName}，请先运行 pnpm release:build。`);
  }

  return resolve(releaseDir, expectedName);
}

async function startOperation({ fetchImpl, url, label, headers, body }) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body
  });
  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(`${label}失败：${formatApiError(data, response.status)}`);
  }

  if (response.status !== 202) {
    throw new Error(`${label}失败：预期 HTTP 202，实际为 HTTP ${response.status}。`);
  }

  const operationId =
    readOperationIdFromLocation(response.headers.get("location")) ??
    data.operationID ??
    data.operationId;
  if (typeof operationId !== "string" || operationId.length === 0) {
    throw new Error(`${label}失败：响应的 Location header 中缺少 operationID。`);
  }

  return operationId;
}

function readOperationIdFromLocation(location) {
  if (!location) {
    return undefined;
  }

  const normalized = location.trim().replace(/\/+$/, "");
  if (!normalized) {
    return undefined;
  }

  const lastSegment = normalized.slice(normalized.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
}

async function waitForOperation({
  fetchImpl,
  sleep,
  url,
  label,
  headers,
  pollIntervalMs,
  operationTimeoutMs
}) {
  const maxPolls = Math.max(1, Math.floor(operationTimeoutMs / pollIntervalMs) + 1);

  for (let poll = 0; poll < maxPolls; poll += 1) {
    const response = await fetchImpl(url, { headers });
    const data = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(`读取${label}状态失败：${formatApiError(data, response.status)}`);
    }

    if (data.status === "Succeeded") {
      return data;
    }

    if (data.status === "Failed") {
      throw new Error(`${label}失败：${formatApiError(data, response.status)}`);
    }

    if (data.status !== "InProgress") {
      throw new Error(`${label}返回未知状态：${JSON.stringify(data.status)}`);
    }

    if (poll < maxPolls - 1) {
      await sleep(pollIntervalMs);
    }
  }

  throw new Error(`${label}超时：等待超过 ${operationTimeoutMs}ms。`);
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function readRequiredEnv(env, names) {
  const values = {};
  const missing = [];

  for (const name of names) {
    const value = env[name];
    if (!value) {
      missing.push(name);
      continue;
    }

    values[name] = value;
  }

  if (missing.length > 0) {
    throw new Error(`缺少 Microsoft Edge Add-ons 发布配置：${missing.join(", ")}`);
  }

  return values;
}

function formatApiError(data, status) {
  const details = [];

  if (data?.errorCode) {
    details.push(data.errorCode);
  }
  if (data?.message) {
    details.push(data.message);
  }
  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    details.push(JSON.stringify(data.errors));
  }
  if (details.length === 0 && data?.raw) {
    details.push(data.raw);
  }

  return details.length > 0 ? details.join(": ") : `HTTP ${status}`;
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (isMain) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
