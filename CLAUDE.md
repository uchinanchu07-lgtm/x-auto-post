# x-auto-post

X（Twitter）運用を AI で自動化するシステム。

## 作業ログの自動記録（重要）

会話の中で以下のような作業を行ったら、ユーザーに言われなくても **必ず** スプシの「作業ログ」シートに記録する。

### 記録対象
- 投稿を作成してスプシに書き込んだとき
- ワークフローや設定を変更・修正したとき
- エラーを調査・修正したとき
- その他、スプシやコードに変更を加えたとき

### 記録タイミング
作業が完了したタイミングで自動的に記録する。ユーザーから「記録して」と言われるのを待たない。

### 記録方法

```bash
node -e "
import('./tools/lib/sheets.mjs').then(async ({ appendRows }) => {
  await appendRows('作業ログ', [
    ['YYYY/MM/DD', '内容', '原因・背景', '対応・結果'],
  ]);
  console.log('作業ログに追記しました');
}).catch(e => console.error(e.message));
"
```

### 記録フォーマット
| 列 | 内容 |
|----|------|
| A: 日付 | yyyy/MM/dd |
| B: 内容 | 何をしたか（簡潔に） |
| C: 原因・背景 | なぜやったか |
| D: 対応・結果 | どうなったか |

## エントリーポイント（最重要）

ユーザーが「開始」「始める」「スタート」「使いたい」「何ができる？」等の
開始を意図するメッセージを送ってきたら、**まずセットアップ状態を自動チェック**する。

### 状態チェック手順

以下を **順番に** 確認する:

1. `node_modules/` が存在するか
2. `.env` が存在し、以下が全て空でないか:
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `SPREADSHEET_ID`
   - `X_API_KEY`, `X_API_KEY_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`, `X_HANDLE`
   - `ANTHROPIC_API_KEY`
3. `credentials/tokens.json` が存在するか
4. `profile/profile.json` が存在するか

### チェック結果に応じた対応

#### 全て OK の場合 → メニュー提示

```text
x-auto-post の準備ができています！
何をしますか？

1. 投稿を作る — トレンドを調べてあなたと一緒に投稿を作ります
2. 投稿を一括生成 — AIがまとめて下書きを作ります
3. 投稿する — スプシで「承認済み」にした投稿を X に投稿します
4. 振り返り — 過去の投稿のパフォーマンスを分析します

番号か、やりたいことを教えてください。
```

- 1 → `.claude/skills/create-post/SKILL.md`（or `.cursor/skills/create-post/SKILL.md`）を読んで実行
- 2 → `node tools/generate-posts.mjs` の件数をヒアリングして実行
- 3 → `node tools/post-to-x.mjs --dry-run` でプレビュー → 確認後に実行
- 4 → `node tools/review-performance.mjs` を実行

#### 1つでも NG の場合 → セットアップに誘導

```text
x-auto-post を使うには初期設定が必要です。
10〜20分ほどで完了します。一緒に進めましょう！
```

その後 `setup/SETUP-FOR-CC.md` を読み、不足しているステップだけを実行する。
（既に完了しているステップはスキップする）

## トリガー一覧

| ユーザーの発話 | エージェントの動作 |
|---|---|
| 「開始」「始める」「スタート」「使いたい」「何ができる？」 | 上記のエントリーポイント（状態チェック → メニュー or セットアップ誘導） |
| 「セットアップして」「初期設定」 | `setup/SETUP-FOR-CC.md` を読んで手順に従う |
| 「投稿作りたい」「ツイート考えて」「X投稿」 | create-post スキルを発動 |
| 「投稿して」 | `node tools/post-to-x.mjs` を実行 |
| 「一括生成して」「まとめて作って」 | 件数をヒアリング → `node tools/generate-posts.mjs` |
| 「振り返りして」「伸びた投稿は？」 | `node tools/review-performance.mjs` |
| 「スケジューラ起動」 | `node tools/schedule.mjs` |

## 概要

- AI分身プロファイルで口調・価値観を再現した投稿を自動生成
- Google スプレッドシートで投稿のライフサイクルを一元管理（SSOT）
- X API v2 で自動投稿（スレッド対応）
- パフォーマンス振り返りで AI が学習ループを回す

## 使い方

投稿を作りたいときは「投稿作りたい」「ツイート考えて」と言うだけ。
→ `.claude/skills/create-post/SKILL.md` のスキルが発動する。

### スキルのフロー
1. AIがXのトレンドを調べてネタを3つ提案
2. ユーザーが選ぶ or 自分のネタを出す
3. ユーザーの経験・意見を1〜2回聞く
4. AIが投稿文を2案作る（単体 or スレッド）
5. 確定 → スプシに「下書き」として書き込み（投稿予定日時を自動割当）
6. スプシで確認 → ステータスを「承認済み」に変更
7. 「投稿して」で投稿実行

### コマンド一覧

| コマンド | 用途 |
|---|---|
| `node auth-google.mjs` | Google OAuth 認証（ブラウザが開く） |
| `node tools/init-spreadsheet.mjs` | スプシ接続テスト（--id で SPREADSHEET_ID を .env に保存） |
| `node profile/generate-profile.mjs <csv>` | CSV から AI分身プロファイル生成 |
| `node profile/generate-profile-interactive.mjs '<json>'` | 対話の回答から AI分身プロファイル生成 |
| `node tools/generate-posts.mjs --days 7` | 投稿を一括生成（穴埋め用） |
| `node tools/post-to-x.mjs --all` | 承認済みを全件投稿（スレッド自動対応） |
| `node tools/schedule.mjs` | スケジューラ起動（予定日時に自動投稿） |
| `node tools/review-performance.mjs` | パフォーマンスを取得し profile.json を自動更新 |

## スプレッドシート構成

SSOT: Google スプレッドシート

### 投稿管理シート
| 列 | 内容 |
|----|------|
| A: ID | 連番 |
| B: ステータス | 下書き / 承認済み / 投稿済み / エラー |
| C: 投稿予定日時 | yyyy/MM/dd HH:mm（日本時間） |
| D: 投稿文 | 本文（スレッドは `---` 区切り） |
| E: 文字数 | 自動計算 |
| F: 投稿リンク | 投稿後に自動記入 |
| G: 投稿日時 | 実際に投稿された日時 |
| H: 備考 | エラー内容等 |

## ディレクトリ構成

```
x-auto-post/
├── CLAUDE.md                      # このファイル（エージェント用の全体指示書）
├── README.md                      # ユーザー向けドキュメント
├── package.json
├── .env                           # APIキー（git管理外）
├── .env.example                   # 環境変数テンプレート
├── auth-google.mjs                # Google OAuth 認証（ブラウザ）
├── setup/
│   └── SETUP-FOR-CC.md            # エージェント駆動セットアップ手順書
├── .claude/skills/create-post/    # 投稿作成スキル（Claude Code用）
├── .cursor/skills/create-post/    # 投稿作成スキル（Cursor用）
├── profile/
│   ├── profile.json               # AI分身プロファイル（git管理外）
│   ├── profile.example.json       # プロファイルサンプル
│   ├── generate-profile.mjs       # CSV からプロファイル生成
│   └── generate-profile-interactive.mjs  # 対話からプロファイル生成
├── tools/
│   ├── lib/sheets.mjs             # Google Sheets ヘルパー（addPost含む）
│   ├── init-spreadsheet.mjs       # スプシID保存 + 接続テスト
│   ├── generate-posts.mjs         # 投稿一括生成
│   ├── post-to-x.mjs             # X API 投稿（スレッド対応）
│   ├── schedule.mjs               # cron スケジューラ（スレッド対応）
│   ├── review-performance.mjs     # パフォーマンス振り返り＋profile自動更新
│   └── build-dist.mjs            # 配布用 ZIP 生成
└── credentials/tokens.json        # Google OAuth（git管理外）
```

## 技術スタック

- Node.js (ESM)
- `twitter-api-v2` — X API
- `@anthropic-ai/sdk` — Claude API
- `googleapis` — Sheets API v4
- `node-cron` — スケジューラ
