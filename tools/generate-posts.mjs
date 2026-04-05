#!/usr/bin/env node

/**
 * generate-posts.mjs — AI分身プロファイルに基づいて投稿を一括生成し、スプシに書き込む
 *
 * Usage:
 *   node tools/generate-posts.mjs              # 7日分（デフォルト）生成
 *   node tools/generate-posts.mjs --days 14    # 14日分生成
 *   node tools/generate-posts.mjs --count 5    # 5件生成
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import { readSheet, addPost } from "./lib/sheets.mjs";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: join(PROJECT_ROOT, ".env") });

const PROFILE_PATH = join(PROJECT_ROOT, "profile", "profile.json");
const SETTINGS_SHEET = "設定";

function parseArgs() {
  const args = process.argv.slice(2);
  let count = null;
  let days = 7;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--days" && args[i + 1]) {
      days = parseInt(args[i + 1], 10);
      i++;
    }
    if (args[i] === "--count" && args[i + 1]) {
      count = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return { count, days };
}

async function getSettings() {
  try {
    const rows = await readSheet(SETTINGS_SHEET, "A:B");
    const settings = {};
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] && rows[i][1]) {
        settings[rows[i][0]] = rows[i][1];
      }
    }
    return settings;
  } catch {
    return {};
  }
}

async function generatePosts(profile, count) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `あなたは以下のプロファイルを持つ X（Twitter）アカウントの AI分身です。このプロファイルに完全に従って投稿文を生成してください。

## プロファイル

${JSON.stringify(profile, null, 2)}

## 指示

${count}件の投稿文を生成してください。

### ルール
- 各投稿は 280文字以内（日本語）
- プロファイルの口調・価値観を完全に再現すること
- プロファイルの rules を全て守ること
- ng_expressions に含まれる表現は絶対に使わないこと
- top_patterns を参考に、伸びやすい構成で書くこと
- 同じ内容や似たパターンの繰り返しを避けること
- 各投稿にバリエーションを持たせること（フック、構成、トーンを変える）
- credential に含まれる実績は使ってよいが、捏造は禁止
- 関西弁は使わない。標準語ベースのカジュアルな口語体で書くこと
- 感嘆符を3つ以上連続で使わない
- AIっぽい定型表現（「〜という観点で」「〜は重要です」等）は使わない

### 出力形式

JSON 配列のみを出力してください。説明文は不要です。

[
  "投稿文1",
  "投稿文2",
  ...
]`;

  console.log(`Claude API で ${count} 件の投稿を生成中...`);
  const response = await client.messages.create({
    model: "claude-opus-4-20250514",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Claude の応答から JSON 配列を抽出できませんでした");
  }
  return JSON.parse(jsonMatch[0]);
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY が .env に設定されていません");
    process.exit(1);
  }

  if (!existsSync(PROFILE_PATH)) {
    console.error("Error: profile.json が見つかりません");
    console.error("先に node profile/generate-profile.mjs <csv-path> を実行してください");
    process.exit(1);
  }

  const { count: argCount, days } = parseArgs();
  const settings = await getSettings();

  const postsPerDay = parseInt(settings["投稿頻度"] || "1", 10);
  const totalCount = argCount || days * postsPerDay;

  console.log(`生成設定: ${totalCount}件（${days}日分 x ${postsPerDay}回/日）`);
  console.log("");

  const profile = JSON.parse(readFileSync(PROFILE_PATH, "utf-8"));
  const posts = await generatePosts(profile, totalCount);

  console.log(`${posts.length} 件の投稿が生成されました`);
  console.log("");

  console.log("スプレッドシートに書き込み中...");
  for (const text of posts) {
    const { id, scheduledAt } = await addPost(text);
    console.log(`  [ID ${id}] ${scheduledAt}（${text.length}文字）`);
    console.log(`    ${text.slice(0, 80)}${text.length > 80 ? "..." : ""}`);
  }

  console.log("");
  console.log(`${posts.length} 件を「下書き」としてスプシに書き込みました`);
  console.log("スプシで内容を確認し、OKなら「ステータス」を「承認済み」に変更してください。");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
