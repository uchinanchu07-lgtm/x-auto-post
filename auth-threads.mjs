#!/usr/bin/env node

/**
 * auth-threads.mjs — Threads OAuth 2.0 認証フロー
 *
 * Meta Developer アプリの認証情報を使って Threads の長期アクセストークンを取得し、
 * .env に THREADS_ACCESS_TOKEN / THREADS_USER_ID / THREADS_HANDLE を保存する。
 *
 * 事前準備:
 *   1. https://developers.facebook.com/ でアプリを作成
 *   2. 「Threads API」を追加
 *   3. リダイレクト URI に http://localhost:3002/callback を登録
 *   4. .env に THREADS_APP_ID と THREADS_APP_SECRET を設定
 *
 * Usage: node auth-threads.mjs
 */

import { createServer } from "http";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, ".env");
dotenv.config({ path: ENV_PATH });

const REDIRECT_PORT = 3002;
const REDIRECT_URI = process.env.THREADS_REDIRECT_URI || `http://localhost:${REDIRECT_PORT}/callback`;
const SCOPES = "threads_basic,threads_content_publish";

function getAppCredentials() {
  const appId = process.env.THREADS_APP_ID;
  const appSecret = process.env.THREADS_APP_SECRET;
  if (!appId || !appSecret) {
    console.error("Error: THREADS_APP_ID / THREADS_APP_SECRET が .env に設定されていません");
    console.error("");
    console.error("Meta Developer でアプリを作成し、以下を .env に追加してください:");
    console.error("  THREADS_APP_ID=<アプリID>");
    console.error("  THREADS_APP_SECRET=<アプリシークレット>");
    process.exit(1);
  }
  return { appId, appSecret };
}

/** 短期アクセストークンを取得 */
async function getShortLivedToken(appId, appSecret, code) {
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
    code,
  });

  const res = await fetch("https://graph.threads.net/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data = await res.json();
  if (data.error) throw new Error(`トークン取得失敗: ${data.error.message}`);
  return data.access_token;
}

/** 長期アクセストークンに交換（60日間有効） */
async function getLongLivedToken(appId, appSecret, shortToken) {
  const url = new URL("https://graph.threads.net/access_token");
  url.searchParams.set("grant_type", "th_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("access_token", shortToken);

  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error) throw new Error(`長期トークン交換失敗: ${data.error.message}`);
  return data.access_token;
}

/** ユーザー情報（ID と ユーザー名）を取得 */
async function getUserInfo(token) {
  const url = new URL("https://graph.threads.net/v1.0/me");
  url.searchParams.set("fields", "id,username");
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error) throw new Error(`ユーザー情報取得失敗: ${data.error.message}`);
  return { userId: data.id, handle: data.username };
}

/** .env ファイルの指定キーを上書き or 追加 */
function updateEnv(updates) {
  let content = "";
  try {
    content = readFileSync(ENV_PATH, "utf-8");
  } catch {
    // .env がなければ空から始める
  }

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content = content.trimEnd() + `\n${key}=${value}\n`;
    }
  }

  writeFileSync(ENV_PATH, content, "utf-8");
}

/** ローカルサーバーでコールバックを待つ */
function waitForCallback() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || "", `http://localhost:${REDIRECT_PORT}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const error = url.searchParams.get("error");
      if (error) {
        res.writeHead(400);
        res.end(`認証失敗: ${error}`);
        server.close();
        reject(new Error(`OAuth エラー: ${error}`));
        return;
      }

      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(400);
        res.end("認証コードが受信できませんでした");
        server.close();
        reject(new Error("認証コードなし"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<html><body><h1>認証コード受信</h1><p>このタブを閉じてターミナルに戻ってください。</p></body></html>");

      server.close();
      resolve(code);
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(`コールバック待機中: ${REDIRECT_URI}`);
    });

    setTimeout(() => {
      server.close();
      reject(new Error("タイムアウト（5分）"));
    }, 5 * 60 * 1000);
  });
}

async function main() {
  const { appId, appSecret } = getAppCredentials();

  const authUrl = new URL("https://threads.net/oauth/authorize");
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("response_type", "code");

  console.log("=== Threads 認証 ===");
  console.log("");
  console.log("以下の URL をブラウザで開いてください:");
  console.log(authUrl.toString());
  console.log("");

  try {
    const { default: open } = await import("open");
    await open(authUrl.toString());
    console.log("ブラウザを開きました。");
  } catch {
    console.log("ブラウザ自動起動に失敗しました。上記URLを手動で開いてください。");
  }

  console.log("");

  const code = await waitForCallback();
  console.log("認証コードを受信しました。トークンを取得中...");

  const shortToken = await getShortLivedToken(appId, appSecret, code);
  const longToken = await getLongLivedToken(appId, appSecret, shortToken);
  const { userId, handle } = await getUserInfo(longToken);

  updateEnv({
    THREADS_ACCESS_TOKEN: longToken,
    THREADS_USER_ID: userId,
    THREADS_HANDLE: handle,
  });

  console.log("");
  console.log("✓ 認証完了！.env に以下を保存しました:");
  console.log(`  THREADS_ACCESS_TOKEN=（取得済み）`);
  console.log(`  THREADS_USER_ID=${userId}`);
  console.log(`  THREADS_HANDLE=${handle}`);
  console.log("");
  console.log("これで Threads への自動投稿が有効になります。");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
