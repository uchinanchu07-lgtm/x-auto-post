import { TwitterApi } from "twitter-api-v2";
import dotenv from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), ".");
dotenv.config({ path: join(PROJECT_ROOT, ".env"), override: true });

const client = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_KEY_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
});

try {
  const me = await client.v2.me();
  console.log("認証OK:", me.data);
} catch (err) {
  console.error("エラー:", err.code, err.message);
  if (err.data) console.error("詳細:", JSON.stringify(err.data, null, 2));
}
