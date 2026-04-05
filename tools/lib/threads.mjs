/**
 * threads.mjs — Threads API ヘルパー
 *
 * Meta Threads API v1.0 を使ってテキスト投稿を行う。
 *
 * 必要な環境変数:
 *   THREADS_ACCESS_TOKEN — 長期アクセストークン
 *   THREADS_USER_ID      — Threads ユーザー ID（数値）
 *   THREADS_HANDLE       — Threads ハンドル（URL生成用、@ なし）
 */

const BASE_URL = "https://graph.threads.net/v1.0";

/**
 * テキストコンテナを作成して ID を返す
 * @param {string} userId
 * @param {string} token
 * @param {string} text
 * @param {string|null} replyToId — 前の投稿ID（スレッド連鎖の場合）
 */
async function createContainer(userId, token, text, replyToId = null) {
  const params = new URLSearchParams({
    media_type: "TEXT",
    text,
    access_token: token,
  });
  if (replyToId) params.append("reply_to_id", replyToId);

  const res = await fetch(`${BASE_URL}/${userId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Threads API (create): ${data.error.message}`);
  return data.id;
}

/**
 * コンテナを公開して投稿 ID を返す
 */
async function publishContainer(userId, token, containerId) {
  const params = new URLSearchParams({
    creation_id: containerId,
    access_token: token,
  });

  const res = await fetch(`${BASE_URL}/${userId}/threads_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Threads API (publish): ${data.error.message}`);
  return data.id;
}

/**
 * 単体テキスト投稿。投稿 ID を返す。
 */
export async function postSingleToThreads(userId, token, text) {
  const containerId = await createContainer(userId, token, text);
  // Threads API はコンテナ作成後に少し待つことを推奨
  await new Promise((r) => setTimeout(r, 3000));
  const postId = await publishContainer(userId, token, containerId);
  return postId;
}

/**
 * スレッド連鎖投稿（X のスレッドに相当）。
 * parts の各要素を返信チェーンとして投稿する。
 * 最初の投稿 ID を返す。
 */
export async function postThreadChainToThreads(userId, token, parts) {
  // 1件目を投稿
  const firstContainer = await createContainer(userId, token, parts[0]);
  await new Promise((r) => setTimeout(r, 3000));
  const firstPostId = await publishContainer(userId, token, firstContainer);

  let prevPostId = firstPostId;

  // 2件目以降をリプライとして投稿
  for (let i = 1; i < parts.length; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const container = await createContainer(userId, token, parts[i], prevPostId);
    await new Promise((r) => setTimeout(r, 3000));
    prevPostId = await publishContainer(userId, token, container);
  }

  return firstPostId;
}

/**
 * Threads の投稿 URL を組み立てる
 */
export function buildThreadsUrl(handle, postId) {
  return `https://www.threads.net/@${handle}/post/${postId}`;
}

/**
 * 環境変数から Threads クライアント情報を取得する
 * 設定がない場合は null を返す（Threads 投稿をスキップ）
 */
export function getThreadsConfig() {
  const { THREADS_ACCESS_TOKEN, THREADS_USER_ID, THREADS_HANDLE } = process.env;
  if (!THREADS_ACCESS_TOKEN || !THREADS_USER_ID || !THREADS_HANDLE) return null;
  return {
    token: THREADS_ACCESS_TOKEN,
    userId: THREADS_USER_ID,
    handle: THREADS_HANDLE,
  };
}
