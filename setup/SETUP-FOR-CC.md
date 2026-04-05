# x-auto-post Setup For Claude Code / Cursor Agent

このファイルは、`x-auto-post` の初期設定手順書です。

エージェントはこのファイルを見ながら次の順で進行する。
ユーザーは エージェント の案内に従えばよい。

## 前提

- 認証設定は `.env` に置く
- Google OAuth のトークン保存先は `credentials/tokens.json`
- X API キーも `.env` に置く
- Anthropic API キーも `.env` に置く

## エージェントが最初に確認すること

1. `package.json` が存在すること
2. `node_modules` が存在すること
3. `.env` が存在すること
4. `credentials/tokens.json` が存在すること
5. `.env` に `SPREADSHEET_ID` が設定されていること
6. `.env` に `X_API_KEY` 等の X API キーが設定されていること
7. `.env` に `ANTHROPIC_API_KEY` が設定されていること
8. `profile/profile.json` が存在すること

全て揃っていれば「セットアップ済みです」と伝えてスキップ。
不足があるものだけ、以下の該当ステップを実行する。

## 進行フロー

### 1. 依存関係の確認

- `node_modules` がなければ `npm install` を実行する

### 2. Google Sheets API の設定

`.env` に `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` がなければ、
Google Cloud Console で OAuth クライアントを作成してもらう。
以下のステップA〜Dを **1つずつ** 案内する。一度に全部見せない。

#### ステップA: GCP プロジェクトを作成する

```text
Google Cloud Console でプロジェクトを作ります。

1. https://console.cloud.google.com/ を開く
2. 画面上部のプロジェクト選択 → 「新しいプロジェクト」をクリック
3. プロジェクト名は「x-auto-post」などでOK
4. 「作成」をクリック
5. 作成後、画面上部で今作ったプロジェクトが選択されていることを確認

できたら「できた」と教えてください。
```

#### ステップB: Google Sheets API を有効にする

```text
次に、Google Sheets API を有効にします。

1. 画面上部の検索バーに「Google Sheets API」と入力
2. 検索結果から「Google Sheets API」をクリック
3. 「有効にする」をクリック

できたら「できた」と教えてください。
```

#### ステップC: OAuth 同意画面を設定する

```text
次に、OAuth の設定をします。

1. 画面上部の検索バーに「Google Auth Platform」と入力してクリック
   （または https://console.cloud.google.com/auth/overview を直接開く）
2. 「開始」または「始める」ボタンが表示されたらクリック
3. 以下を入力:
   - アプリ名: 「x-auto-post」
   - ユーザーサポートメール: 自分の Gmail アドレスを選択
4. 対象（ユーザータイプ）は「外部」を選択
5. 連絡先のメールアドレス: 自分の Gmail アドレスを入力
6. 同意のチェックボックスにチェックを入れて「作成」をクリック

できたら「できた」と教えてください。
```

#### ステップC-2: テストユーザーを登録する

```text
次に、自分のGoogleアカウントをテストユーザーとして登録します。
これをしないと、この後の認証でブロックされます。

1. Google Auth Platform の左メニューから「対象」をクリック
   （または https://console.cloud.google.com/auth/audience を直接開く）
2. 「テストユーザー」セクションの「+ Add users」をクリック
3. 自分の Gmail アドレスを入力
4. 「保存」をクリック

できたら「できた」と教えてください。
```

#### ステップD: OAuth クライアントを作成する

```text
次に、クライアントIDとシークレットを発行します。

1. Google Auth Platform の概要ページで「OAuthクライアントを作成」をクリック
   （または左メニューの「クライアント」→ 上部の「+ OAuthクライアントを作成」）
2. アプリケーションの種類: 「デスクトップ アプリ」を選択
3. 名前: 「x-auto-post-local」などでOK
4. 「作成」をクリック
5. ダイアログに「クライアント ID」が表示されるのでコピー
6. 次に、クライアント一覧から今作ったクライアント名をクリック
7. 詳細画面の右下にある「クライアント シークレット」をコピー

⚠️ クライアントシークレットは後から再表示できません。
   必ずこのタイミングでコピーしてください。

クライアントIDとクライアントシークレットの両方を、
このチャットにそのまま貼り付けてください。
こちらで自動的に設定ファイルを作成します。
```

#### `.env` の自動生成

ユーザーがチャットにクライアントIDとクライアントシークレットを貼り付けたら、
エージェントが `.env` ファイルを自動で作成する。

```env
GOOGLE_CLIENT_ID=ユーザーが貼り付けた値
GOOGLE_CLIENT_SECRET=ユーザーが貼り付けた値
GOOGLE_TOKENS_PATH=./credentials/tokens.json
SPREADSHEET_ID=

X_API_KEY=
X_API_KEY_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_TOKEN_SECRET=
X_HANDLE=

ANTHROPIC_API_KEY=
```

> **ユーザーにファイルを直接編集させない。**
> チャットに値を貼り付けてもらい、エージェントが `.env` を生成・更新する。

### 3. Google 認証

`credentials/tokens.json` がなければ:

1. `node auth-google.mjs` を実行
2. ブラウザが開いたら、ユーザーに Google 認証を完了してもらう
3. `credentials/tokens.json` ができたことを確認する

ユーザーへの案内:

```text
今から Google Sheets 用の認証を開始します。
ブラウザが開いたら Google にログインして許可してください。
完了したらこちらで続きの確認をします。
```

> ⚠️ **「アクセスがブロックされました」エラーが出た場合:**
> ステップC-2でテストユーザーの登録が正しくできていない可能性がある。
> 以下を案内する:
>
> ```text
> テストユーザーの登録を再確認してください。
>
> 1. https://console.cloud.google.com/auth/audience を開く
> 2. 「テストユーザー」に自分の Gmail アドレスが登録されているか確認
> 3. 登録されていなければ「+ Add users」で追加して「保存」
> 4. その後、もう一度認証を試してください。
> ```

### 4. スプレッドシートの準備

`SPREADSHEET_ID` が未設定なら:

```text
投稿管理用のスプレッドシートを用意します。
以下のリンクを開いて「コピーを作成」してください。

https://docs.google.com/spreadsheets/d/1Ncb_PRwpjNOnwIjRMbgBRkq_9gAsMgmBVEwzdd1pesY/copy

コピーが完了したら、コピー先のスプレッドシートの URL をこのチャットに貼り付けてください。
```

ユーザーが URL を貼り付けたら:
1. URL から SPREADSHEET_ID を抽出する（`/d/XXXXX/` の部分）
2. `node tools/init-spreadsheet.mjs --id XXXXX` を実行する
3. `.env` に自動書き込み＋接続テストが行われる

完了後:

```text
✓ スプレッドシートの設定が完了しました！
ブラウザで開いて確認してみてください:
（URL を表示）
```

> `SPREADSHEET_ID` が既に設定済みの場合は、`node tools/init-spreadsheet.mjs` で接続テストのみ行う。

### 5. X API の設定

`.env` に `X_API_KEY` 等がなければ、X Developer Portal でアプリを作成してもらう。
以下を **1つずつ** 案内する。

#### ステップA: X Developer アカウントの作成

```text
次に、X（Twitter）API の設定をします。

https://developer.x.com/ を開いてログインしてください。

初めての場合は開発者アカウントの申請が必要です。
申請画面が表示されたら、次のステップで回答テンプレートを渡しますので
そのまま教えてください。

既にダッシュボードが表示される場合は「もうある」と教えてください。
```

ユーザーが「申請画面が出た」等と言った場合、以下の回答テンプレートを渡す:

```text
申請フォームの回答テンプレートです。
そのままコピペで使ってください。

■ 利用目的（Use case）
→ 「Making a bot」または「Building tools for Twitter users」を選択

■ 用途の説明（Describe all your use cases）
以下をそのままコピペしてください（250文字以上必要です）:

---
I am building a personal scheduling tool for my own X account.
The tool uses the X API v2 to post tweets and threads at scheduled times.
Posts are managed in a Google Spreadsheet and published via the API.
No user data is collected or displayed to third parties.
The tool is for personal use only and does not aggregate, analyze,
or display any Twitter content from other users.
Posting is done through OAuth 1.0a User Context on my own account.
---

■ 政府機関での利用（Government use）
→ 「No」を選択

■ ツイートやRTを行うか
→ 「Yes」— posting tweets on my own account

■ ツイートの表示やエンゲージメント
→ 「No」— I do not display tweets to third parties

あとは同意チェックボックスにチェックを入れて送信してください。
承認は通常すぐ〜数分で完了します。

できたら「できた」と教えてください。
```

#### ステップA-2: Free プランの確認

```text
Developer Portal のダッシュボードで:
- Free プランになっていることを確認（月500投稿まで。十分です）
- プロジェクトとアプリが作成されていることを確認

できたら「できた」と教えてください。
```

> ⚠️ アプリがプロジェクトの中に存在しない場合、投稿時に 403 エラーになる。
> 「Projects & Apps」セクションでアプリがプロジェクト配下にあることを確認する。

#### ステップB: アプリの権限を設定

```text
アプリの権限を「Read and Write」に変更します。

1. Developer Portal でアプリの設定画面を開く
2. 「User authentication settings」セクションの「Set up」をクリック
3. App permissions を「Read and write」に設定
4. Type of App は「Web App, Automated App or Bot」を選択
5. Callback URL に http://localhost と入力
6. Website URL に http://localhost と入力
7. 「Save」をクリック

できたら「できた」と教えてください。
```

#### ステップC: キーとトークンを取得

```text
次に、4つのキーを取得します。

1. アプリの「Keys and tokens」タブを開く
2. 「Consumer Keys」セクションの「Regenerate」をクリック
   → API Key と API Key Secret が表示されるのでコピー
3. 「Authentication Tokens」セクションの「Generate」をクリック
   → Access Token と Access Token Secret が表示されるのでコピー

4つの値を全てこのチャットに貼り付けてください:
- API Key (Consumer Key)
- API Key Secret (Consumer Secret)
- Access Token
- Access Token Secret
```

エージェントは受け取った値を `.env` に書き込む。

#### ステップD: X ハンドル名

```text
最後に、投稿先の X アカウントのハンドル名を教えてください。
（@は不要です。例: your_handle）
```

エージェントは `.env` の `X_HANDLE` に書き込む。

### 6. Anthropic API の設定

`.env` に `ANTHROPIC_API_KEY` がなければ:

```text
投稿生成に Claude API を使います。

1. https://console.anthropic.com/ を開く
2. API Keys ページで新しいキーを作成
3. キーをこのチャットに貼り付けてください
```

エージェントは受け取った値を `.env` の `ANTHROPIC_API_KEY` に書き込む。

### 7. AI分身プロファイルの生成

`profile/profile.json` がなければ:

```text
最後に、AIがあなたの投稿スタイルを学習するプロファイルを作ります。

方法は2つあります:
A) X の分析データ（CSV）をお持ちなら、それを元に自動生成します
B) いくつか質問に答えてもらうだけで、対話から生成します

AかBか教えてください。（分からなければ B で大丈夫です）
```

#### A: CSV から生成

`node profile/generate-profile.mjs <csv-path>` を実行。

CSV のダウンロード方法が分からない場合は案内する:

```text
X Analytics の CSV はこちらからダウンロードできます:
https://x.com/i/account_analytics/content?type=posts&sort=date&dir=desc&days=90
画面右上のダウンロードアイコンをクリックしてください。
```

#### B: 対話から生成

以下の 6 つの質問を **1問ずつ** 聞く。一度に全部見せない。
ユーザーの回答はメモしておく。

1. 「X での発信テーマ・ジャンルは何ですか？（例: AI活用、副業、マーケティング）」
2. 「誰に向けて発信していますか？（例: 個人事業主、エンジニア、経営者）」
3. 「普段の口調はどんな感じですか？（例: カジュアル、丁寧語、ですます調、フランク）」
4. 「実績や肩書きで使えるものはありますか？（例: 月商1000万、3社のコンサル経験）」
5. 「繰り返し伝えたいテーマや信念はありますか？」
6. 「これだけは使いたくない表現はありますか？（例: 絵文字多用、煽り表現）」

全て聞き終わったら、回答を JSON にまとめてスクリプトを実行:

```bash
node profile/generate-profile-interactive.mjs '{"handle":"ユーザーのハンドル","theme":"回答1","target":"回答2","tone":"回答3","credential":"回答4","values":"回答5","ng":"回答6"}'
```

完了後:

```text
✓ プロファイルが完成しました！
内容を確認してください。修正したい箇所があれば教えてください。
```

ユーザーが修正を求めた場合は、`profile/profile.json` を直接編集して対応する。

### 8. 動作確認

全て設定が完了したら:

```bash
node tools/post-to-x.mjs --dry-run
```

エラーなく実行できれば完了。

```text
セットアップが完了しました！

「投稿作りたい」と言えば、投稿作成スキルが発動します。
```

## 完了条件

- `.env` が存在し、以下が全て設定されている:
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SPREADSHEET_ID`
  - `X_API_KEY`, `X_API_KEY_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`, `X_HANDLE`
  - `ANTHROPIC_API_KEY`
- `credentials/tokens.json` が存在する
- スプレッドシートに「投稿管理」「プロファイル」「設定」シートがある
- `profile/profile.json` が存在する
- `node tools/post-to-x.mjs --dry-run` が正常終了する

## よくあるエラーと対応

| エラーメッセージ | 原因 | 対応 |
|---------------|------|------|
| `GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が未設定です` | `.env` がないか値が空 | ステップ2の手順を案内 |
| `Token file not found` | Google 認証未完了 | ステップ3の認証フローを案内 |
| `SPREADSHEET_ID not set` | スプシ未設定 | ステップ4でスプシを作成 |
| `X API キーが .env に設定されていません` | X API 未設定 | ステップ5の手順を案内 |
| `X_HANDLE が .env に設定されていません` | ハンドル未設定 | ステップ5Dを案内 |
| `アクセスがブロックされました` | テストユーザー未登録 | ステップ2 C-2を案内 |
| `401 Unauthorized` (X API) | キーが間違っている | OAuth 1.0a の4つのキーを再確認 |
| `403 Client Forbidden` | アプリがプロジェクトに紐づいていない | X Developer Console でプロジェクト内にアプリを作り直す |

## 運用メモ

- 初回は必ずこのファイルの順で進める
- ユーザーには毎回「次に何をすればよいか」を1ステップずつ伝える
- ユーザーにファイルを直接編集させない。チャットに値を貼り付けてもらい、エージェントが `.env` を生成・更新する
