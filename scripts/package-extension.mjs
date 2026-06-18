import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(projectRoot, "dist");
const releaseDir = resolve(projectRoot, "release");
const packageJson = readJson(resolve(projectRoot, "package.json"));
const manifestPath = resolve(distDir, "manifest.json");

if (!existsSync(manifestPath)) {
  throw new Error("dist/manifest.json 不存在，请先运行 pnpm build。");
}

const manifest = readJson(manifestPath);
if (packageJson.version !== manifest.version) {
  throw new Error(
    `package.json version (${packageJson.version}) 与 manifest version (${manifest.version}) 不一致。`
  );
}

mkdirSync(releaseDir, { recursive: true });

const zipName = `${packageJson.name}-v${packageJson.version}.zip`;
const zipPath = resolve(releaseDir, zipName);
rmSync(zipPath, { force: true });

const zipResult = spawnSync(
  "zip",
  ["-r", "-q", zipPath, ".", "-x", "*.map", "-x", "__MACOSX/*"],
  {
    cwd: distDir,
    stdio: "inherit"
  }
);

if (zipResult.error) {
  throw zipResult.error;
}

if (zipResult.status !== 0) {
  throw new Error(`zip 打包失败，退出码：${zipResult.status}`);
}

console.log(zipPath);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
