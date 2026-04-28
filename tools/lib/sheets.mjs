/**
 * sheets.mjs — Google Sheets 認証・接続ヘルパー
 *
 * 認証方式（優先順）:
 *   1. サービスアカウント: credentials/service-account.json が存在する場合
 *   2. OAuth2: credentials/tokens.json + .env の GOOGLE_CLIENT_ID/SECRET
 *
 * 必須 .env:
 *   SPREADSHEET_ID
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import dotenv from "dotenv";

export const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: join(PROJECT_ROOT, ".env"), override: true });

export let SPREADSHEET_ID = process.env.SPREADSHEET_ID;
export const SHEET_NAME = process.env.SHEET_NAME || "投稿管理";

const SERVICE_ACCOUNT_PATH = join(PROJECT_ROOT, "credentials", "service-account.json");
const TOKENS_PATH =
  process.env.GOOGLE_TOKENS_PATH || join(PROJECT_ROOT, "credentials", "tokens.json");

/**
 * 認証クライアントを返す
 * サービスアカウントが存在すればそちらを優先、なければ OAuth2 にフォールバック
 */
export function getAuthClient() {
  // --- サービスアカウント優先 ---
  if (existsSync(SERVICE_ACCOUNT_PATH)) {
    const key = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, "utf-8"));
    return new google.auth.GoogleAuth({
      credentials: key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  }

  // --- OAuth2 フォールバック ---
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error("Error: credentials/service-account.json も GOOGLE_CLIENT_ID/SECRET も見つかりません");
    process.exit(1);
  }
  if (!existsSync(TOKENS_PATH)) {
    console.error(`Error: Token file not found at ${TOKENS_PATH}`);
    console.error("Run: node auth-google.mjs");
    process.exit(1);
  }
  const tokens = JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  client.setCredentials(tokens);
  return client;
}

let _sheets;

export async function getSheets() {
  if (_sheets) return _sheets;

  if (!SPREADSHEET_ID) {
    console.error("Error: SPREADSHEET_ID not set in .env");
    process.exit(1);
  }

  const auth = getAuthClient();
  // GoogleAuth はgetClient()が必要、OAuth2クライアントはそのまま使える
  const authClient = typeof auth.getClient === "function" ? await auth.getClient() : auth;
  _sheets = google.sheets({ version: "v4", auth: authClient });
  return _sheets;
}

export const TEMPLATE_COPY_URL =
  "https://docs.google.com/spreadsheets/d/1Ncb_PRwpjNOnwIjRMbgBRkq_9gAsMgmBVEwzdd1pesY/copy";

/**
 * SPREADSHEET_ID を .env に書き込む
 * @param {string} newId - スプレッドシートID
 */
export function saveSpreadsheetId(newId) {
  const envPath = join(PROJECT_ROOT, ".env");
  let envContent = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  if (envContent.match(/^SPREADSHEET_ID=.*$/m)) {
    envContent = envContent.replace(/^SPREADSHEET_ID=.*$/m, `SPREADSHEET_ID=${newId}`);
  } else {
    envContent += `\nSPREADSHEET_ID=${newId}\n`;
  }
  writeFileSync(envPath, envContent, "utf-8");

  SPREADSHEET_ID = newId;
  process.env.SPREADSHEET_ID = newId;
  _sheets = null;
}

/**
 * シートが存在しなければ作成する
 */
export async function ensureSheet(sheetName) {
  const sheets = await getSheets();
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!A1`,
    });
  } catch {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    });
  }
}

/**
 * シートの全データを読み取る（ヘッダー含む）
 */
export async function readSheet(sheetName, range = "A:H") {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!${range}`,
  });
  return res.data.values || [];
}

/**
 * シートにデータを追記する
 */
export async function appendRows(sheetName, rows) {
  if (!rows.length) return 0;
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!A:H`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
  return rows.length;
}

/**
 * シートの特定セル範囲を更新する
 */
export async function updateRange(sheetName, range, values) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!${range}`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

/**
 * 投稿1件をスプシに追加する（ID・スケジュール・文字数を自動計算）
 *
 * @param {string} text - 投稿文
 * @param {object} opts - オプション
 * @param {string} opts.status - ステータス（デフォルト: "下書き"）
 * @param {string} opts.scheduledAt - 投稿予定日時を明示指定する場合（省略で自動割当）
 * @param {string} opts.note - 備考
 * @returns {{ id: number, scheduledAt: string }} 追加された行の情報
 */
export async function addPost(text, opts = {}) {
  const sheetName = SHEET_NAME;
  const rows = await readSheet(sheetName);

  // ID 自動採番
  const ids = rows.slice(1).map((r) => parseInt(r[0], 10)).filter((n) => !isNaN(n));
  const nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;

  // スケジュール自動割当
  const scheduledAt = opts.scheduledAt || await findNextSlot(rows);

  const row = [
    nextId,
    opts.status || "下書き",
    scheduledAt,
    text,
    text.length,
    "", // 投稿リンク
    "", // 投稿日時
    opts.note || "",
  ];

  await appendRows(sheetName, [row]);
  return { id: nextId, scheduledAt };
}

/**
 * 設定シートの投稿時間と既存予約から、次に空いている投稿枠を返す
 */
async function findNextSlot(postRows) {
  const settingsRows = await readSheet("設定");
  let times = ["08:00"];

  for (const row of settingsRows.slice(1)) {
    if (row[0] === "投稿時間") {
      times = String(row[1]).split(",").map((t) => t.trim());
    }
  }

  // 既存の投稿予定日時を Set に
  const booked = new Set();
  for (const row of postRows.slice(1)) {
    const v = row[2];
    if (v && String(v).trim()) booked.add(String(v).trim());
  }

  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let d = 0; d < 365; d++) {
    for (const time of times) {
      const [h, m] = time.split(":").map(Number);
      const candidate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0);
      if (candidate <= now) continue;

      const y = candidate.getFullYear();
      const mo = String(candidate.getMonth() + 1).padStart(2, "0");
      const dd = String(candidate.getDate()).padStart(2, "0");
      const hh = String(candidate.getHours()).padStart(2, "0");
      const mi = String(candidate.getMinutes()).padStart(2, "0");
      const formatted = `${y}/${mo}/${dd} ${hh}:${mi}`;

      if (!booked.has(formatted)) return formatted;
    }
    date.setDate(date.getDate() + 1);
  }

  return "枠なし";
}

/**
 * シートをクリアしてヘッダー付きで上書きする
 */
export async function writeSheet(sheetName, headers, rows) {
  const sheets = await getSheets();
  const data = [headers, ...rows];
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!A:Z`,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: data },
  });
}
