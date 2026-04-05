#!/usr/bin/env node

/**
 * generate-profile-interactive.mjs — 対話で得た回答から AI分身プロファイルを生成する
 *
 * エージェントがユーザーに質問 → 回答を集めて JSON として渡す → Claude API が
 * profile.json を組み立てる。CSV がなくてもプロファイルを作れる。
 *
 * Usage:
 *   node profile/generate-profile-interactive.mjs '<JSON>'
 *
 * JSON の形式:
 *   {
 *     "handle": "your_handle",
 *     "theme": "発信テーマ",
 *     "target": "ターゲット層",
 *     "tone": "口調の特徴",
 *     "credential": "実績・肩書き",
 *     "values": "繰り返し語りたいテーマ・信念",
 *     "ng": "使いたくない表現",
 *     "reference_posts": "参考にしたい投稿（あれば）"
 *   }
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: join(PROJECT_ROOT, ".env") });

const PROFILE_PATH = join(PROJECT_ROOT, "profile", "profile.json");

async function buildProfileWithClaude(answers) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `以下はユーザーへのヒアリング結果です。これを元に「AI人格プロファイル」を生成してください。

## ヒアリング内容

- ハンドル名: @${answers.handle || "your_handle"}
- 発信テーマ/ジャンル: ${answers.theme || "未回答"}
- ターゲット層: ${answers.target || "未回答"}
- 口調・文体の特徴: ${answers.tone || "未回答"}
- 実績・肩書き: ${answers.credential || "未回答"}
- 繰り返し語りたいテーマ・信念: ${answers.values || "未回答"}
- 使いたくない表現: ${answers.ng || "特になし"}
- 参考にしたい投稿やアカウント: ${answers.reference_posts || "特になし"}

## 指示

1. ヒアリング内容を深掘りし、X投稿で使えるルールに具体化すること
2. 「口調」は実際のツイートで使う語尾や言い回しの例を含めること
3. 「rules」はこの人格を再現するために守るべき具体的なルール 5〜7個
4. 「top_patterns」は回答から推測される、伸びそうな投稿パターンの仮説
5. ユーザーが回答していない項目は、他の回答から合理的に推測すること

## 出力形式

以下の JSON 形式で出力してください。JSON のみを出力し、説明文は不要です。

{
  "handle": "@${answers.handle || "your_handle"}",
  "tone": "口調の具体的な説明（語尾の例を含む）",
  "target": "ターゲット層",
  "credential": "実績（ヒアリングから抽出）",
  "positioning": "何の専門家として見られたいか",
  "values": "価値観・主張",
  "rules": ["ルール1", "ルール2", ...],
  "top_patterns": "伸びそうな投稿パターンの仮説",
  "ng_expressions": ["NG表現1", "NG表現2", ...],
  "stats": {
    "total_posts": 0,
    "avg_impressions": 0,
    "top_post_impressions": 0
  }
}`;

  console.log("Claude API でプロファイルを生成中...");
  const response = await client.messages.create({
    model: "claude-opus-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Claude の応答から JSON を抽出できませんでした");
  }
  return JSON.parse(jsonMatch[0]);
}

async function main() {
  const jsonArg = process.argv[2];
  if (!jsonArg) {
    console.error("Usage: node profile/generate-profile-interactive.mjs '<JSON>'");
    console.error("");
    console.error("JSON keys: handle, theme, target, tone, credential, values, ng, reference_posts");
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY が .env に設定されていません");
    process.exit(1);
  }

  const answers = JSON.parse(jsonArg);
  console.log("ヒアリング結果:");
  for (const [k, v] of Object.entries(answers)) {
    if (v) console.log(`  ${k}: ${v}`);
  }
  console.log("");

  const profile = await buildProfileWithClaude(answers);

  writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2), "utf-8");
  console.log(`✓ プロファイルを保存しました: ${PROFILE_PATH}`);
  console.log("");
  console.log("=== AI分身プロファイル ===");
  console.log(JSON.stringify(profile, null, 2));
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
