import { getAuthClient, SPREADSHEET_ID } from './tools/lib/sheets.mjs';
import { google } from 'googleapis';

const auth = getAuthClient();
const sheets = google.sheets({ version: 'v4', auth });

// 投稿管理シートのシートIDを取得
const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
const sheet = meta.data.sheets.find(s => s.properties.title === '投稿管理');
const sheetId = sheet.properties.sheetId;

// B列（2行目以降）にドロップダウンを設定
await sheets.spreadsheets.batchUpdate({
  spreadsheetId: SPREADSHEET_ID,
  requestBody: {
    requests: [{
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,  // 2行目から
          endRowIndex: 1000,
          startColumnIndex: 1,  // B列
          endColumnIndex: 2,
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: [
              { userEnteredValue: '下書き' },
              { userEnteredValue: '承認済み' },
              { userEnteredValue: '投稿済み' },
              { userEnteredValue: 'エラー' },
            ],
          },
          showCustomUi: true,
          strict: false,
        },
      },
    }],
  },
});

console.log('✓ ステータス列にプルダウンを設定しました');
