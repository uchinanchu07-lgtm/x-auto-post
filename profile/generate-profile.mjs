#!/usr/bin/env node

/**
 * generate-profile.mjs — X Analytics CSV から AI分身プロファイルを生成する
 *
 * 過去の投稿データを Anthropic API で分析し、口調・価値観・パターンを抽出して profile.json に保存。
 * 生成後、スプレッドシートのプロファイルシートにも書き込む。
 *
 * Usage:
 *   node profile/generate-profile.mjs <csv-path>
 *   node profile/generate-profile.mjs ~/Downloads/tweet_activity_metrics.csv
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import { ensureSheet, writeSheet } from "../tools/lib/sheets.mjs";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: join(PROJECT_ROOT, ".env"), override: true });

const PROFILE_PATH = join(PROJECT_ROOT, "profile", "profile.json");
const PROFILE_SHEET = "プロファイル";

function parseCSV(text) {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = (values[idx] || "").trim();
    });
    rows.push(obj);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

async function analyzeWithClaude(csvData) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const postsSummary = csvData
    .map((row) => {
      const text = row["Post text"] || row["Tweet text"] || row["ポスト本文"] || "";
      const impressions = row["impressions"] || row["インプレッション"] || "0";
      const likes = row["likes"] || row["いいね"] || "0";
      const engagements = row["engagements"] || row["エンゲージメント"] || "0";
      return `---\n本文: ${text}\nインプレッション: ${impressions} / いいね: ${likes} / エンゲージメント: ${engagements}`;
    })
    .join("\n\n");

  const handle = process.env.X_HANDLE || "your_handle";
  const prompt = `以下は @${handle} の過去のX投稿データです。全て分析して「AI人格プロファイル」を作成してください。

## 投稿データ

${postsSummary}

## 分析してほしいこと

1. 口調の特徴（語尾のパターン、言い回し、文体のクセ）
2. 価値観・主張（繰り返し語っているテーマ、信念）
3. 伸びている投稿の共通パターン（構成、フックの作り方、文字数傾向）
4. 使える実績・数字（投稿で実際に言及されているもののみ。捏造禁止）
5. ターゲット層（誰に向けて発信しているか）
6. ポジショニング（何の専門家として見られたいか）
7. 絶対に使ってはいけない表現やNGワード
8. この人格を再現するために守るべきルール（5〜7個）
9. 伸びた投稿に共通する構成パターンの説明

## 出力形式

以下の JSON 形式で出力してください。JSON のみを出力し、説明文は不要です。

{
  "handle": "@${handle}",
  "tone": "口調の具体的な説明",
  "target": "ターゲット層",
  "credential": "実績（投稿から抽出したもののみ）",
  "positioning": "ポジショニング",
  "values": "価値観・主張",
  "rules": ["ルール1", "ルール2", ...],
  "top_patterns": "伸びた投稿の共通パターン",
  "ng_expressions": ["NG表現1", "NG表現2", ...],
  "stats": {
    "total_posts": 数値,
    "avg_impressions": 数値,
    "top_post_impressions": 数値
  }
}`;

  console.log("Claude API で分析中...");
  const response = await client.messages.create({
    model: "claude-opus-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text;

  // JSON 部分を抽出
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Claude の応答から JSON を抽出できませんでした");
  }
  return JSON.parse(jsonMatch[0]);
}

async function syncToSheet(profile) {
  await ensureSheet(PROFILE_SHEET);
  const rows = Object.entries(profile).map(([key, value]) => {
    const display = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
    return [key, display];
  });
  await writeSheet(PROFILE_SHEET, ["項目", "内容"], rows);
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: node profile/generate-profile.mjs <csv-path>");
    console.error("");
    console.error("X Analytics の CSV ファイルのパスを指定してください。");
    console.error("ダウンロード方法:");
    console.error("  1. https://x.com/i/account_analytics/content?type=posts&sort=date&dir=desc&days=90 を開く");
    console.error("  2. 画面右上のダウンロードアイコンをクリック");
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY が .env に設定されていません");
    process.exit(1);
  }

  console.log(`CSV を読み込み中: ${csvPath}`);
  const csvText = readFileSync(csvPath, "utf-8");
  const csvData = parseCSV(csvText);
  console.log(`${csvData.length} 件の投稿を読み込みました`);

  const profile = await analyzeWithClaude(csvData);

  writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2), "utf-8");
  console.log(`プロファイルを保存しました: ${PROFILE_PATH}`);

  console.log("スプレッドシートに同期中...");
  await syncToSheet(profile);
  console.log("スプレッドシートに同期しました");

  console.log("");
  console.log("=== AI分身プロファイル ===");
  console.log(JSON.stringify(profile, null, 2));
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
