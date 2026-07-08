#!/usr/bin/env node

/**
 * review-performance.mjs — 投稿済みツイートのパフォーマンスを取得し、
 * profile.json の top_patterns を自動アップデートする。
 *
 * X API Free tier は月100リードなので、投稿済みの中から未取得分のみ取得する。
 *
 * Usage:
 *   node tools/review-performance.mjs              # 未取得の投稿済みを全件チェック
 *   node tools/review-performance.mjs --top 5      # トップ5を表示して profile 更新
 *   node tools/review-performance.mjs --dry-run    # 取得だけして profile は更新しない
 */

import { TwitterApi } from "twitter-api-v2";
import Anthropic from "@anthropic-ai/sdk";
import { readSheet, updateRange, ensureSheet, appendRows, SHEET_NAME } from "./lib/sheets.mjs";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: join(PROJECT_ROOT, ".env"), override: true });

const PROFILE_PATH = join(PROJECT_ROOT, "profile", "profile.json");
const PERF_SHEET = "パフォーマンス";

function getClient() {
  const { X_API_KEY, X_API_KEY_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET } = process.env;
  if (!X_API_KEY || !X_API_KEY_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) {
    console.error("Error: X API キーが .env に設定されていません");
    process.exit(1);
  }
  return new TwitterApi({
    appKey: X_API_KEY,
    appSecret: X_API_KEY_SECRET,
    accessToken: X_ACCESS_TOKEN,
    accessSecret: X_ACCESS_TOKEN_SECRET,
  });
}

function extractTweetId(link) {
  if (!link) return null;
  const match = String(link).match(/status\/(\d+)/);
  return match ? match[1] : null;
}

async function fetchMetrics(client, tweetIds) {
  if (!tweetIds.length) return {};

  const batchSize = 100;
  const results = {};

  for (let i = 0; i < tweetIds.length; i += batchSize) {
    const batch = tweetIds.slice(i, i + batchSize);
    try {
      const res = await client.v2.tweets(batch, {
        "tweet.fields": "public_metrics",
      });

      if (res.data) {
        for (const tweet of res.data) {
          results[tweet.id] = tweet.public_metrics;
        }
      }
    } catch (err) {
      console.error(`  API エラー (batch ${i}):`, err.message);
    }
  }

  return results;
}

async function updateProfileWithAI(profile, topPosts) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("ANTHROPIC_API_KEY が未設定のため、プロファイル更新をスキップします");
    return null;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const postsText = topPosts
    .map((p, i) => `${i + 1}. (imp: ${p.impressions}, like: ${p.likes}, RT: ${p.retweets})\n   "${p.text}"`)
    .join("\n\n");

  const prompt = `以下は最近の X 投稿のうち、パフォーマンスが良かったトップ投稿です。

## トップ投稿
${postsText}

## 現在の top_patterns
${profile.top_patterns}

## 指示
上記のトップ投稿を分析し、top_patterns を更新してください。
- 既存のパターンで引き続き有効なものは残す
- 新しく見つかったパターンを追加する
- 具体的な投稿の例を引用して説得力を持たせる
- 200文字以内で簡潔にまとめる

top_patterns の文字列のみを出力してください。説明文や前置きは不要です。`;

  const response = await client.messages.create({
    model: "claude-opus-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  return response.content[0].text.trim();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const topN = (() => {
    const idx = args.indexOf("--top");
    return idx >= 0 && args[idx + 1] ? parseInt(args[idx + 1], 10) : 5;
  })();

  console.log("=== 投稿パフォーマンス振り返り ===");
  console.log("");

  // 投稿管理シートから「投稿済み」を取得
  const rows = await readSheet(SHEET_NAME);
  if (rows.length <= 1) {
    console.log("投稿データがありません");
    return;
  }

  const header = rows[0];
  const idCol = header.indexOf("ID");
  const statusCol = header.indexOf("ステータス");
  const textCol = header.indexOf("投稿文");
  const linkCol = header.indexOf("投稿リンク");

  const posted = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][statusCol] === "投稿済み" && rows[i][linkCol]) {
      const tweetId = extractTweetId(rows[i][linkCol]);
      if (tweetId) {
        posted.push({
          rowIndex: i + 1,
          id: rows[i][idCol],
          text: rows[i][textCol],
          link: rows[i][linkCol],
          tweetId,
        });
      }
    }
  }

  if (!posted.length) {
    console.log("「投稿済み」の投稿がありません");
    return;
  }

  console.log(`投稿済み: ${posted.length}件`);
  console.log("X API からメトリクスを取得中...");
  console.log("");

  const client = getClient();
  const tweetIds = posted.map((p) => p.tweetId);
  const metrics = await fetchMetrics(client, tweetIds);

  // パフォーマンスシートに記録
  await ensureSheet(PERF_SHEET);
  const perfHeader = ["ID", "投稿文", "投稿リンク", "imp", "like", "RT", "reply", "quote", "bookmark", "取得日時"];

  const existingPerf = await readSheet(PERF_SHEET, "A1:A1");
  if (!existingPerf.length || existingPerf[0][0] !== "ID") {
    const sheets = (await import("./lib/sheets.mjs")).getSheets;
    await updateRange(PERF_SHEET, "A1:J1", [perfHeader]);
  }

  const enriched = [];
  const perfRows = [];
  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

  for (const post of posted) {
    const m = metrics[post.tweetId];
    if (!m) {
      console.log(`  [ID ${post.id}] メトリクス取得失敗（削除済み or 非公開）`);
      continue;
    }

    const entry = {
      ...post,
      impressions: m.impression_count || 0,
      likes: m.like_count || 0,
      retweets: m.retweet_count || 0,
      replies: m.reply_count || 0,
      quotes: m.quote_count || 0,
      bookmarks: m.bookmark_count || 0,
    };
    enriched.push(entry);

    perfRows.push([
      post.id,
      post.text,
      post.link,
      entry.impressions,
      entry.likes,
      entry.retweets,
      entry.replies,
      entry.quotes,
      entry.bookmarks,
      now,
    ]);

    console.log(`  [ID ${post.id}] imp: ${entry.impressions} / like: ${entry.likes} / RT: ${entry.retweets}`);
    console.log(`    ${post.text.slice(0, 60)}${post.text.length > 60 ? "..." : ""}`);
  }

  if (perfRows.length) {
    await appendRows(PERF_SHEET, perfRows);
    console.log("");
    console.log(`パフォーマンスシートに ${perfRows.length} 件を記録しました`);
  }

  if (!enriched.length) {
    console.log("メトリクスを取得できた投稿がありませんでした");
    return;
  }

  // トップN を選出
  enriched.sort((a, b) => b.impressions - a.impressions);
  const topPosts = enriched.slice(0, topN);

  console.log("");
  console.log(`=== トップ ${Math.min(topN, topPosts.length)} 投稿 ===`);
  topPosts.forEach((p, i) => {
    console.log(`${i + 1}. [imp: ${p.impressions} / like: ${p.likes} / RT: ${p.retweets}]`);
    console.log(`   "${p.text.slice(0, 80)}${p.text.length > 80 ? "..." : ""}"`);
    console.log("");
  });

  // profile.json の top_patterns を更新
  if (dryRun) {
    console.log("（ドライラン: プロファイル更新はスキップ）");
    return;
  }

  if (!existsSync(PROFILE_PATH)) {
    console.log("profile.json が見つかりません。プロファイル更新をスキップします。");
    return;
  }

  const profile = JSON.parse(readFileSync(PROFILE_PATH, "utf-8"));
  console.log("Claude API でトップ投稿を分析し、top_patterns を更新中...");

  const newPatterns = await updateProfileWithAI(profile, topPosts);
  if (!newPatterns) return;

  const oldPatterns = profile.top_patterns;
  profile.top_patterns = newPatterns;
  writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2) + "\n");

  console.log("");
  console.log("=== top_patterns 更新 ===");
  console.log(`旧: ${oldPatterns}`);
  console.log("");
  console.log(`新: ${newPatterns}`);
  console.log("");
  console.log("profile.json を更新しました。");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
