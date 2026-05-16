import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT_DIR = process.cwd();
const SOURCE_FILE = "ximalaya-metadata.user.js";
const DIST_DIR = "dist";
const DIST_USER_FILE = path.join(DIST_DIR, "ximalaya-metadata.user.js");
const DIST_META_FILE = path.join(DIST_DIR, "ximalaya-metadata.meta.js");
const README_FILE = "README.md";
const README_MARKER_START = "<!-- userscript-links:start -->";
const README_MARKER_END = "<!-- userscript-links:end -->";

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoSlug = args.repo || process.env.GITHUB_REPOSITORY || inferRepoSlug();
  const branch = args.branch || process.env.GITHUB_REF_NAME || inferCurrentBranch();

  if (!repoSlug) {
    throw new Error("无法确定仓库 slug，请通过 --repo owner/name 传入。");
  }

  if (!branch) {
    throw new Error("无法确定分支名，请通过 --branch main 传入。");
  }

  const repoUrl = `https://github.com/${repoSlug}`;
  const rawBaseUrl = `https://raw.githubusercontent.com/${repoSlug}/${branch}`;
  const installUrl = `${rawBaseUrl}/${toPosixPath(DIST_USER_FILE)}`;
  const updateUrl = `${rawBaseUrl}/${toPosixPath(DIST_META_FILE)}`;
  const sourceUrl = `${repoUrl}/blob/${branch}/${toPosixPath(SOURCE_FILE)}`;

  const sourceCode = readFileUtf8(SOURCE_FILE);
  const { metadataBlock, body } = splitUserscript(sourceCode);
  const baseVersion = extractMetadataValue(metadataBlock, "version");
  const buildVersion = createBuildVersion(baseVersion);
  const builtMetadataBlock = buildMetadataBlock(metadataBlock, {
    namespace: repoUrl,
    homepageURL: repoUrl,
    supportURL: `${repoUrl}/issues`,
    downloadURL: installUrl,
    updateURL: updateUrl,
    version: buildVersion,
  });
  const builtUserscript = `${builtMetadataBlock}${body}`;
  const metaFileContent = `${builtMetadataBlock}\n`;

  fs.mkdirSync(path.join(ROOT_DIR, DIST_DIR), { recursive: true });
  writeFileUtf8(DIST_USER_FILE, builtUserscript);
  writeFileUtf8(DIST_META_FILE, metaFileContent);

  const readmeContent = readFileUtf8(README_FILE);
  const readmeReplacement = [
    README_MARKER_START,
    "- [一键安装脚本](INSTALL_URL)",
    "- [自动更新元数据](UPDATE_URL)",
    "- [查看源码](SOURCE_URL)",
    README_MARKER_END,
  ]
    .join("\n")
    .replaceAll("INSTALL_URL", installUrl)
    .replaceAll("UPDATE_URL", updateUrl)
    .replaceAll("SOURCE_URL", sourceUrl);

  const updatedReadme = replaceMarkedBlock(
    readmeContent,
    README_MARKER_START,
    README_MARKER_END,
    readmeReplacement
  );
  writeFileUtf8(README_FILE, updatedReadme);

  process.stdout.write(
    [
      `repo=${repoSlug}`,
      `branch=${branch}`,
      `version=${buildVersion}`,
      `install=${installUrl}`,
      `update=${updateUrl}`,
    ].join("\n") + "\n"
  );
}

function parseArgs(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--repo" && next) {
      result.repo = next;
      index += 1;
      continue;
    }

    if (token === "--branch" && next) {
      result.branch = next;
      index += 1;
    }
  }

  return result;
}

function inferRepoSlug() {
  const remoteUrl = runGit("remote get-url origin");
  if (!remoteUrl) {
    return "";
  }

  const normalized = remoteUrl.trim().replace(/\.git$/u, "");
  const httpsMatch = normalized.match(/github\.com[:/](.+?\/.+)$/u);
  return httpsMatch ? httpsMatch[1] : "";
}

function inferCurrentBranch() {
  return runGit("rev-parse --abbrev-ref HEAD").trim();
}

function createBuildVersion(baseVersion) {
  const normalizedBaseVersion = normalizeBaseVersion(baseVersion || "0.1.0");
  const relevantCommitCount = runGit(
    `rev-list --count HEAD -- ${SOURCE_FILE} ${path.posix.join("tools", "sync-userscript-release.mjs")}`
  ).trim();
  const buildNumber = /^\d+$/u.test(relevantCommitCount)
    ? relevantCommitCount
    : String(Math.floor(Date.now() / 1000));

  return `${normalizedBaseVersion}.${buildNumber}`;
}

function normalizeBaseVersion(version) {
  return String(version)
    .trim()
    .replace(/[^\d.]/gu, "")
    .replace(/\.+$/u, "") || "0.1.0";
}

function buildMetadataBlock(originalBlock, overrides) {
  const lines = originalBlock.trim().split(/\r?\n/u);
  const contentLines = lines.slice(1, -1);

  const firstValueKeys = [
    "name",
    "description",
    "author",
  ];
  const overrideKeys = [
    "namespace",
    "version",
    "homepageURL",
    "supportURL",
    "downloadURL",
    "updateURL",
  ];
  const handledKeys = new Set([...firstValueKeys, ...overrideKeys]);

  const keyWidth = 12;
  const output = ["// ==UserScript=="];

  for (const key of firstValueKeys) {
    const value = extractMetadataValue(originalBlock, key);
    if (value) {
      output.push(formatMetadataLine(key, value, keyWidth));
    }
  }

  output.push(formatMetadataLine("namespace", overrides.namespace, keyWidth));
  output.push(formatMetadataLine("version", overrides.version, keyWidth));
  output.push(formatMetadataLine("homepageURL", overrides.homepageURL, keyWidth));
  output.push(formatMetadataLine("supportURL", overrides.supportURL, keyWidth));
  output.push(formatMetadataLine("downloadURL", overrides.downloadURL, keyWidth));
  output.push(formatMetadataLine("updateURL", overrides.updateURL, keyWidth));

  for (const line of contentLines) {
    const key = getMetadataKey(line);
    if (!key || handledKeys.has(key)) {
      continue;
    }

    output.push(line);
  }

  output.push("// ==/UserScript==");
  return `${output.join("\n")}\n`;
}

function extractMetadataValue(metadataBlock, key) {
  const pattern = new RegExp(`^//\\s*@${escapeRegExp(key)}\\s+(.+)$`, "mu");
  const match = metadataBlock.match(pattern);
  return match ? match[1].trim() : "";
}

function formatMetadataLine(key, value, keyWidth) {
  return `// @${key.padEnd(keyWidth, " ")} ${value}`;
}

function getMetadataKey(line) {
  const match = line.match(/^\/\/\s*@([^\s]+)\s+/u);
  return match ? match[1] : "";
}

function splitUserscript(sourceCode) {
  const match = sourceCode.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\r?\n?/u);
  if (!match) {
    throw new Error("源文件里没有找到 Userscript 元数据头。");
  }

  return {
    metadataBlock: match[0].replace(/\r\n/g, "\n"),
    body: sourceCode.slice(match[0].length),
  };
}

function replaceMarkedBlock(content, startMarker, endMarker, replacement) {
  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`README 中缺少标记块：${startMarker} / ${endMarker}`);
  }

  return `${content.slice(0, startIndex)}${replacement}${content.slice(
    endIndex + endMarker.length
  )}`;
}

function readFileUtf8(filePath) {
  return fs.readFileSync(path.join(ROOT_DIR, filePath), "utf8");
}

function writeFileUtf8(filePath, content) {
  fs.writeFileSync(path.join(ROOT_DIR, filePath), content, "utf8");
}

function runGit(command) {
  try {
    return execSync(`git ${command}`, {
      cwd: ROOT_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join(path.posix.sep);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

main();
