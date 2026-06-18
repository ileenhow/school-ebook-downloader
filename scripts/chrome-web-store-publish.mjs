import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const noPublish = args.includes("--no-publish");
const explicitZipPath = args.find((arg) => !arg.startsWith("--"));
const zipPath = explicitZipPath ? resolve(projectRoot, explicitZipPath) : await findDefaultZipPath();

const env = readRequiredEnv([
  "CWS_PUBLISHER_ID",
  "CWS_EXTENSION_ID",
  "CWS_CLIENT_ID",
  "CWS_CLIENT_SECRET",
  "CWS_REFRESH_TOKEN"
]);
const accessToken = await refreshAccessToken(env);

await uploadPackage(accessToken, env.CWS_PUBLISHER_ID, env.CWS_EXTENSION_ID, zipPath);

if (noPublish) {
  console.log("已上传到 Chrome Web Store，跳过提交审核。");
} else {
  await publishPackage(accessToken, env.CWS_PUBLISHER_ID, env.CWS_EXTENSION_ID);
  console.log("已提交 Chrome Web Store 审核。");
}

async function findDefaultZipPath() {
  const packageJson = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));
  const releaseDir = resolve(projectRoot, "release");
  const expectedName = `${packageJson.name}-v${packageJson.version}.zip`;
  const entries = await readdir(releaseDir);

  if (!entries.includes(expectedName)) {
    throw new Error(`没有找到 ${expectedName}，请先运行 pnpm release:build。`);
  }

  return resolve(releaseDir, expectedName);
}

async function refreshAccessToken(env) {
  const body = new URLSearchParams({
    client_id: env.CWS_CLIENT_ID,
    client_secret: env.CWS_CLIENT_SECRET,
    refresh_token: env.CWS_REFRESH_TOKEN,
    grant_type: "refresh_token"
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const data = await readJsonResponse(response);

  if (!response.ok || typeof data.access_token !== "string") {
    throw new Error(`获取 OAuth access token 失败：${formatApiError(data)}`);
  }

  return data.access_token;
}

async function uploadPackage(accessToken, publisherId, extensionId, packagePath) {
  const uploadUrl = `https://chromewebstore.googleapis.com/upload/v2/publishers/${publisherId}/items/${extensionId}:upload`;
  const packageBuffer = await readFile(packagePath);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/zip"
    },
    body: packageBuffer
  });
  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(`上传 Chrome Web Store 包失败：${formatApiError(data)}`);
  }

  console.log(`已上传扩展包：${packagePath}`);
  console.log(JSON.stringify(data, null, 2));
}

async function publishPackage(accessToken, publisherId, extensionId) {
  const publishUrl = `https://chromewebstore.googleapis.com/v2/publishers/${publisherId}/items/${extensionId}:publish`;
  const response = await fetch(publishUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(`提交 Chrome Web Store 审核失败：${formatApiError(data)}`);
  }

  console.log(JSON.stringify(data, null, 2));
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

function readRequiredEnv(names) {
  const values = {};
  const missing = [];

  for (const name of names) {
    const value = process.env[name];
    if (!value) {
      missing.push(name);
      continue;
    }

    values[name] = value;
  }

  if (missing.length > 0) {
    throw new Error(`缺少 Chrome Web Store 发布密钥：${missing.join(", ")}`);
  }

  return values;
}

function formatApiError(data) {
  if (data?.error_description) {
    return data.error_description;
  }

  if (data?.error?.message) {
    return data.error.message;
  }

  if (data?.error) {
    return typeof data.error === "string" ? data.error : JSON.stringify(data.error);
  }

  return JSON.stringify(data);
}
