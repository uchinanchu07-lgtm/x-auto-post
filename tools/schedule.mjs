#!/usr/bin/env node

/**
 * schedule.mjs — 投稿予定日時に基づいて自動投稿する cron スケジューラ
 *
 * スプシの「承認済み」投稿の中から、投稿予定日時が過ぎたものを順次投稿する。
 * 1分ごとにチェックし、該当があれば投稿 → ステータス更新。
 *
 * Usage:
 *   node tools/schedule.mjs           # スケジューラ起動（フォアグラウンド）
 *   node tools/schedule.mjs --once    # 1回だけチェックして終了
 */

import cron from "node-cron";
import { TwitterApi } from "twitter-api-v2";
import { readSheet, updateRange, SHEET_NAME } from "./lib/sheets.mjs";
import { postSingleToThreads, postThreadChainToThreads, buildThreadsUrl, getThreadsConfig } from "./lib/threads.mjs";
import dotenv from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: join(PROJECT_ROOT, ".env") });

const HANDLE = process.env.X_HANDLE;
if (!HANDLE) {
  console.error("Error: X_HANDLE が .env に設定されていません");
  process.exit(1);
}
const THREAD_SEPARATOR = "---";

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

async function checkAndPost() {
  const now = new Date();
  const rows = await readSheet(SHEET_NAME);
  if (rows.length <= 1) return;

  const headerRow = rows[0];
  const statusCol = headerRow.indexOf("ステータス");
  const dateCol = headerRow.indexOf("投稿予定日時");
  const textCol = headerRow.indexOf("投稿文");
  const idCol = headerRow.indexOf("ID");

  const client = getClient();
  let posted = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[statusCol] !== "承認済み") continue;

    const scheduledStr = row[dateCol];
    if (!scheduledStr) continue;

    const scheduled = new Date(scheduledStr.replace(/\//g, '-').replace(' ', 'T') + '+09:00');
    if (isNaN(scheduled.getTime())) continue;
    if (scheduled > now) continue;

    const id = row[idCol];
    const text = row[textCol];
    const rowIndex = i + 1;

    const jstNow = () => new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    console.log(`[${jstNow()}] 投稿中: ID ${id}`);

    try {
      const parts = text.split(THREAD_SEPARATOR).map((s) => s.trim()).filter((s) => s.length > 0);
      const isThread = parts.length > 1;
      const remarks = [];

      // --- X 投稿 ---
      let firstTweetId;
      if (isThread) {
        const first = await client.v2.tweet(parts[0]);
        firstTweetId = first.data.id;
        let lastId = firstTweetId;
        for (let p = 1; p < parts.length; p++) {
          await new Promise((r) => setTimeout(r, 1500));
          const reply = await client.v2.tweet(parts[p], { reply: { in_reply_to_tweet_id: lastId } });
          lastId = reply.data.id;
        }
        remarks.push(`スレッド ${parts.length}件`);
      } else {
        const result = await client.v2.tweet(text);
        firstTweetId = result.data.id;
      }

      const xLink = `https://x.com/${HANDLE}/status/${firstTweetId}`;
      const postTime = jstNow();

      await updateRange(SHEET_NAME, `B${rowIndex}`, [["投稿済み"]]);
      await updateRange(SHEET_NAME, `F${rowIndex}:G${rowIndex}`, [[xLink, postTime]]);

      console.log(`  → X 成功${isThread ? `（スレッド ${parts.length}件）` : ""}: ${xLink}`);

      // --- Threads 投稿（認証情報がある場合） ---
      const threadsConfig = getThreadsConfig();
      if (threadsConfig) {
        try {
          let threadsPostId;
          if (isThread) {
            threadsPostId = await postThreadChainToThreads(threadsConfig.userId, threadsConfig.token, parts);
          } else {
            threadsPostId = await postSingleToThreads(threadsConfig.userId, threadsConfig.token, text);
          }
          const threadsLink = buildThreadsUrl(threadsConfig.handle, threadsPostId);
          remarks.push(`Threads: ${threadsLink}`);
          console.log(`  → Threads 成功: ${threadsLink}`);
        } catch (threadsErr) {
          const msg = `Threads エラー: ${(threadsErr.message || String(threadsErr)).slice(0, 100)}`;
          remarks.push(msg);
          console.error(`  → ${msg}`);
        }
      }

      if (remarks.length > 0) {
        await updateRange(SHEET_NAME, `H${rowIndex}`, [[remarks.join(" | ")]]);
      }

      posted++;

      await new Promise((r) => setTimeout(r, 3000));
    } catch (err) {
      const errorMsg = err.message || String(err);
      await updateRange(SHEET_NAME, `B${rowIndex}`, [["エラー"]]);
      await updateRange(SHEET_NAME, `H${rowIndex}`, [[errorMsg.slice(0, 200)]]);
      console.error(`  → エラー: ${errorMsg}`);
    }
  }

  if (posted > 0) {
    console.log(`[${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}] ${posted}件を投稿しました`);
  }
}

async function main() {
  const once = process.argv.includes("--once");

  if (once) {
    console.log("1回チェックモード");
    await checkAndPost();
    console.log("完了");
    return;
  }

  console.log("=== X自動投稿スケジューラ ===");
  console.log(`アカウント: @${HANDLE}`);
  console.log("1分ごとにスプシをチェックし、投稿予定日時が過ぎた「承認済み」投稿を自動で投稿します。");
  console.log("停止: Ctrl+C");
  console.log("");

  // 起動時に1回チェック
  await checkAndPost();

  // 1分ごとにチェック
  cron.schedule("* * * * *", async () => {
    try {
      await checkAndPost();
    } catch (err) {
      console.error(`[${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}] チェックエラー:`, err.message);
    }
  });
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
