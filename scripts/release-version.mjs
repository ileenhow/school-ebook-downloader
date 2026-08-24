import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = resolve(projectRoot, "package.json");
const manifestPath = resolve(projectRoot, "public/manifest.json");
const versionSpec = process.argv[2];

if (!versionSpec || process.argv.length !== 3) {
  fail("用法：pnpm release:version <patch|minor|major|x.y.z>");
}

assertNodeVersion();
assertGitState();

const packageSource = await readFile(packagePath, "utf8");
const manifestSource = await readFile(manifestPath, "utf8");
const packageJson = JSON.parse(packageSource);
const manifest = JSON.parse(manifestSource);

if (packageJson.version !== manifest.version) {
  fail(
    `版本不一致：package.json=${packageJson.version}，public/manifest.json=${manifest.version}。`
  );
}

const currentVersion = parseVersion(packageJson.version, "当前版本");
const nextVersion = resolveNextVersion(currentVersion, versionSpec);
const tag = `v${formatVersion(nextVersion)}`;

if (git(["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`], { allowFailure: true }).status === 0) {
  fail(`tag ${tag} 已存在。`);
}

const nextPackageSource = replaceJsonVersion(packageSource, packageJson.version, formatVersion(nextVersion));
const nextManifestSource = replaceJsonVersion(manifestSource, manifest.version, formatVersion(nextVersion));

await writeFile(packagePath, nextPackageSource);
await writeFile(manifestPath, nextManifestSource);

try {
  command("pnpm", ["release:build"]);
} catch (error) {
  await Promise.all([
    writeFile(packagePath, packageSource),
    writeFile(manifestPath, manifestSource)
  ]);
  throw error;
}

git(["add", "package.json", "public/manifest.json"]);
git(["commit", "-m", `release: ${tag}`]);
git(["tag", "-a", tag, "-m", `Release ${tag}`]);

try {
  git(["push", "--atomic", "origin", "main", tag]);
} catch (error) {
  console.error(`提交和 ${tag} 已保留在本地，尚未推送。`);
  console.error(`处理问题后重试：git push --atomic origin main ${tag}`);
  throw error;
}

console.log(`已发布 ${tag}；GitHub Actions 将自动构建并等待商店发布审批。`);

function assertNodeVersion() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    fail(`需要 Node.js >=22.12.0，当前为 ${process.versions.node}。请先运行 nvm use。`);
  }
}

function assertGitState() {
  const branch = gitOutput(["branch", "--show-current"]);
  if (branch !== "main") {
    fail(`只能从 main 发布，当前分支为 ${branch || "detached HEAD"}。`);
  }

  if (gitOutput(["status", "--porcelain"])) {
    fail("工作树不干净，请先提交或暂存现有修改。");
  }

  git(["fetch", "--tags", "origin", "main"]);

  const head = gitOutput(["rev-parse", "HEAD"]);
  const remoteMain = gitOutput(["rev-parse", "origin/main"]);
  if (head !== remoteMain) {
    fail("本地 main 与 origin/main 不一致，请先执行 git pull --ff-only。");
  }
}

function resolveNextVersion(currentVersion, spec) {
  const [major, minor, patch] = currentVersion;

  if (spec === "major") {
    return [major + 1, 0, 0];
  }
  if (spec === "minor") {
    return [major, minor + 1, 0];
  }
  if (spec === "patch") {
    return [major, minor, patch + 1];
  }

  const explicitVersion = parseVersion(spec, "目标版本");
  if (compareVersions(explicitVersion, currentVersion) <= 0) {
    fail(`目标版本 ${spec} 必须高于当前版本 ${formatVersion(currentVersion)}。`);
  }

  return explicitVersion;
}

function parseVersion(value, label) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) {
    fail(`${label} ${value} 不是有效的 x.y.z 版本号。`);
  }

  const version = match.slice(1).map(Number);
  if (version.some((part) => part > 65_535)) {
    fail(`${label} ${value} 的每一段都必须小于或等于 65535。`);
  }

  return version;
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

function formatVersion(version) {
  return version.join(".");
}

function replaceJsonVersion(source, currentVersion, nextVersion) {
  const versionPattern = /(\"version\"\s*:\s*)\"([^\"]+)\"/g;
  const matches = [...source.matchAll(versionPattern)];
  if (matches.length !== 1 || matches[0][2] !== currentVersion) {
    fail("无法安全定位 JSON version 字段。");
  }

  return source.replace(versionPattern, `$1\"${nextVersion}\"`);
}

function git(args, options) {
  return command("git", args, options);
}

function gitOutput(args) {
  return git(args, { captureOutput: true }).stdout.trim();
}

function command(executable, args, { allowFailure = false, captureOutput = false } = {}) {
  const result = spawnSync(executable, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: captureOutput ? "pipe" : "inherit"
  });

  if (result.error) {
    throw result.error;
  }
  if (!allowFailure && result.status !== 0) {
    const details = captureOutput ? result.stderr.trim() : "";
    throw new Error(details || `${executable} ${args.join(" ")} 执行失败。`);
  }

  return result;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
