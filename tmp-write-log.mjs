import { ensureSheet, appendRows } from './tools/lib/sheets.mjs';

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const date = "2026/04/04";

await ensureSheet("作業ログ");

const rows = [
  ["日時", "作業内容", "結果"],
  [date + " 午前", "Node.js インストール（v24.14.1 zip版）", "完了"],
  [date + " 午前", "npm install（依存パッケージ）", "完了"],
  [date + " 午前", "Google Cloud / Sheets API 設定", "完了"],
  [date + " 午前", "Google OAuth 認証", "完了"],
  [date + " 午前", "スプレッドシート接続設定", "完了"],
  [date + " 午後", "X Developer Portal / Pay Per Use 設定", "完了"],
  [date + " 午後", "X API OAuth 1.0a キー設定", "完了"],
  [date + " 午後", "Anthropic API キー設定", "完了"],
  [date + " 午後", "AI分身プロファイル生成", "完了"],
  [date + " 午後", "投稿作成（こども誰でも通園スレッド）", "完了"],
  [date + " " + now.split(" ")[1], "X へスレッド投稿（3ツイート）", "投稿済み"],
  [date + " " + now.split(" ")[1], "投稿14件一括生成", "完了"],
  [date + " " + now.split(" ")[1], "パフォーマンス振り返り・profile.json更新", "完了"],
];

// ヘッダー行と残りを分けて書き込み
const { writeSheet } = await import('./tools/lib/sheets.mjs');
await writeSheet("作業ログ", rows[0], rows.slice(1));
console.log("✓ 作業ログをスプレッドシートに書き込みました");
