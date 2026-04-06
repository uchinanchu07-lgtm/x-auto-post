#!/usr/bin/env node

/**
 * sort-sheet.mjs — スプシの投稿管理シートを並び替える
 *
 * 並び順:
 *   1. 承認済み（投稿予定日時 昇順）
 *   2. 下書き（投稿予定日時 昇順）
 *   3. エラー（投稿予定日時 昇順）
 *   4. 投稿済み（投稿予定日時 降順）
 *
 * Usage:
 *   node tools/sort-sheet.mjs
 */

import { readSheet, writeSheet, SHEET_NAME } from "./lib/sheets.mjs";

const STATUS_ORDER = ["承認済み", "下書き", "エラー", "投稿済み"];

function parseDate(str) {
  if (!str) return new Date(0);
  const d = new Date(str.replace(/\//g, "-").replace(" ", "T") + "+09:00");
  return isNaN(d.getTime()) ? new Date(0) : d;
}

async function main() {
  console.log("スプレッドシートを読み込み中...");
  const rows = await readSheet(SHEET_NAME);
  if (rows.length <= 1) {
    console.log("データがありません");
    return;
  }

  const header = rows[0];
  const dataRows = rows.slice(1);

  const statusCol = header.indexOf("ステータス");
  const dateCol = header.indexOf("投稿予定日時");

  dataRows.sort((a, b) => {
    const sa = a[statusCol] || "";
    const sb = b[statusCol] || "";
    const oa = STATUS_ORDER.indexOf(sa);
    const ob = STATUS_ORDER.indexOf(sb);
    const orderA = oa === -1 ? STATUS_ORDER.length : oa;
    const orderB = ob === -1 ? STATUS_ORDER.length : ob;

    if (orderA !== orderB) return orderA - orderB;

    // 投稿済みは新しい順（降順）、それ以外は古い順（昇順）
    const da = parseDate(a[dateCol]);
    const db = parseDate(b[dateCol]);
    return sa === "投稿済み" ? db - da : da - db;
  });

  console.log("並び替え中...");
  await writeSheet(SHEET_NAME, header, dataRows);
  console.log("完了！スプレッドシートを確認してください。");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
