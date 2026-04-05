# x-auto-post

X（Twitter）運用を AI で自動化するシステム。

Claude Code / Cursor Agent と対話しながら投稿を作成し、Google スプレッドシートで管理、X API で自動投稿する。

## 機能

- **AI対話型の投稿作成** — トレンド調査 → ネタ提案 → 対話 → 投稿文生成
- **スレッド投稿** — `---` 区切りで複数ツイートを自動連投
- **スプレッドシート管理** — 投稿のライフサイクルを一元管理（下書き → 承認済み → 投稿済み）
- **投稿予定の自動スケジューリング** — 空き枠を自動計算して割り当て
- **AI分身プロファイル** — 過去の投稿データからあなたの口調・価値観を学習
- **パフォーマンス振り返り** — 投稿のインプレッション・エンゲージメントを取得し、プロファイルを自動改善
- **自動投稿スケジューラ** — cron で予定日時に自動投稿

## セットアップ

### 1. 依存インストール

```bash
npm install
```

### 2. 環境変数の設定

```bash
cp .env.example .env
```

`.env` を開いて以下を設定:

#### Google Sheets API

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. Google Sheets API を有効化
3. OAuth 2.0 クライアント ID を作成（デスクトップアプリ）
4. `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` を `.env` に設定
5. OAuth 認証を行い、取得したトークンを `credentials/tokens.json` に保存

#### X API

1. [X Developer Portal](https://developer.x.com/) でアプリを作成（プロジェクト内に作成すること）
2. OAuth 1.0a User Context の権限を「Read and Write」に設定
3. 以下の4つのキーを `.env` に設定:
   - `X_API_KEY` (Consumer Key)
   - `X_API_KEY_SECRET` (Consumer Secret)
   - `X_ACCESS_TOKEN`
   - `X_ACCESS_TOKEN_SECRET`
4. `X_HANDLE` にあなたの X ハンドル名（@なし）を設定

#### Anthropic API

1. [Anthropic Console](https://console.anthropic.com/) で API キーを取得
2. `ANTHROPIC_API_KEY` を `.env` に設定

### 3. スプレッドシートの準備

以下のリンクを開いて「コピーを作成」してください:

```
https://docs.google.com/spreadsheets/d/1Ncb_PRwpjNOnwIjRMbgBRkq_9gAsMgmBVEwzdd1pesY/copy
```

コピー後、スプレッドシートの URL から ID を取得して設定:

```bash
npm run init-sheet -- --id YOUR_SPREADSHEET_ID
```

ヘッダー・プルダウン・シート構成・書式は全てテンプレートから引き継がれます。

### 4. AI分身プロファイルの生成

**A) CSV から生成（推奨）**

X の分析データ（CSV）をダウンロードして:

```bash
npm run profile -- ~/Downloads/tweet_activity_metrics.csv
```

**B) 対話から生成（CSV がない場合）**

Claude Code / Cursor Agent に「プロファイル作りたい」と言えば、6つの質問に答えるだけで `profile.json` が生成されます。

`profile/profile.json` が生成されます。

## 使い方

### 対話で投稿を作る（推奨）

Claude Code または Cursor Agent に「投稿作りたい」と言うだけ。
スキル（`.claude/skills/create-post/` or `.cursor/skills/create-post/`）が発動し、トレンド調査 → 対話 → 投稿文作成 → スプシ書き込みまで自動で行います。

### コマンドで一括生成

```bash
npm run generate                    # 7日分を一括生成
npm run generate -- --days 14       # 14日分
npm run generate -- --count 5       # 5件
```

### 投稿の実行

スプシで投稿のステータスを「承認済み」に変更してから:

```bash
npm run post                        # 1件投稿
npm run post -- --all               # 全件投稿
npm run post -- --dry-run           # ドライラン（投稿せずに確認）
```

### 自動投稿スケジューラ

```bash
npm run schedule                    # 1分ごとにチェック＆自動投稿
```

### パフォーマンス振り返り

```bash
npm run review                      # エンゲージメント取得 + profile更新
npm run review -- --dry-run         # 取得だけ（profile変更なし）
```

## スプレッドシート構成

### 投稿管理シート

| 列 | 内容 |
|----|------|
| A: ID | 連番（自動採番） |
| B: ステータス | 下書き / 承認済み / 投稿済み / エラー |
| C: 投稿予定日時 | yyyy/MM/dd HH:mm（自動割当） |
| D: 投稿文 | 本文（スレッドは `---` 区切り） |
| E: 文字数 | 自動計算 |
| F: 投稿リンク | 投稿後に自動記入 |
| G: 投稿日時 | 実際の投稿日時 |
| H: 備考 | エラー内容、スレッド件数 等 |

## ディレクトリ構成

```
x-auto-post/
├── CLAUDE.md                      # エージェント用の全体指示書
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
│   ├── profile.example.json       # プロファイルのサンプル
│   ├── generate-profile.mjs       # CSV からプロファイル生成
│   └── generate-profile-interactive.mjs  # 対話からプロファイル生成
├── tools/
│   ├── lib/sheets.mjs             # Google Sheets ヘルパー（addPost含む）
│   ├── init-spreadsheet.mjs       # スプシID保存 + 接続テスト
│   ├── generate-posts.mjs         # 投稿一括生成
│   ├── post-to-x.mjs             # X API 投稿（スレッド対応）
│   ├── schedule.mjs               # cron スケジューラ（スレッド対応）
│   ├── review-performance.mjs     # パフォーマンス振り返り
│   └── build-dist.mjs            # 配布用 ZIP 生成
└── credentials/tokens.json        # Google OAuth トークン（git管理外）
```

## 技術スタック

- **Node.js** (ESM)
- **twitter-api-v2** — X API v2 クライアント
- **@anthropic-ai/sdk** — Claude API（投稿生成・プロファイル分析）
- **googleapis** — Google Sheets API v4
- **node-cron** — スケジューラ

## 注意事項

- X API Free tier は月500投稿・100リードの制限があります
- 投稿予定日時は日本時間（JST）で管理されます
- `profile.json` と `.env` と `credentials/` は `.gitignore` で除外済みです
