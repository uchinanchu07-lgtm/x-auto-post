#!/usr/bin/env node

/**
 * build-dist.mjs — 配布用 ZIP ファイルを生成する
 *
 * 個人データ（.env, credentials/, profile/profile.json）を除外し、
 * すぐ使える状態の ZIP を作成する。
 *
 * Usage: node tools/build-dist.mjs
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const DIST_DIR = join(PROJECT_ROOT, "dist");
const ZIP_NAME = "x-auto-post.zip";

const EXCLUDE_PATTERNS = [
  ".env",
  "credentials/*",
  "profile/profile.json",
  "node_modules/*",
  ".claude/settings.local.json",
  "dist/*",
  ".cache/*",
  ".git/*",
];

function main() {
  mkdirSync(DIST_DIR, { recursive: true });

  const excludeArgs = EXCLUDE_PATTERNS.map((p) => `-x '${p}'`).join(" ");
  const outPath = join(DIST_DIR, ZIP_NAME);

  const cmd = `cd "${PROJECT_ROOT}" && zip -r "${outPath}" . ${excludeArgs}`;

  console.log("配布用 ZIP を作成中...");
  console.log(`除外: ${EXCLUDE_PATTERNS.join(", ")}`);
  console.log("");

  try {
    execSync(cmd, { stdio: "inherit" });
  } catch (err) {
    console.error("ZIP 作成に失敗しました:", err.message);
    process.exit(1);
  }

  console.log("");
  console.log(`配布用 ZIP を作成しました: dist/${ZIP_NAME}`);

  // 含まれないファイルの確認
  console.log("");
  console.log("=== 除外されたファイル（個人データ） ===");
  console.log("  .env               — APIキー");
  console.log("  credentials/       — Google OAuthトークン");
  console.log("  profile/profile.json — AI分身プロファイル");
  console.log("  node_modules/      — 依存パッケージ（npm install で復元）");
  console.log("");
  console.log("=== 含まれるテンプレート ===");
  console.log("  .env.example              — 環境変数テンプレート");
  console.log("  profile/profile.example.json — プロファイルサンプル");
  console.log("  setup/SETUP-FOR-CC.md     — セットアップ手順書");
  console.log("  README.md                 — 使い方ガイド");
}

main();
