import { TwitterApi } from "twitter-api-v2";
import * as readline from "readline";

// 新しいアプリのConsumer Key/Secret
const API_KEY = "3hRNHKEeshAJ288vMbkdoZ3LC";
const API_SECRET = "v5TXkB3mrG8qz7lcYK8MaFYk1XTcJ72edc5Cu6IYpR3CJYh4u7";

const client = new TwitterApi({ appKey: API_KEY, appSecret: API_SECRET });

const { url, oauth_token, oauth_token_secret } = await client.generateAuthLink("oob");

console.log("\n以下のURLをブラウザで開いてください:");
console.log(url);
console.log("\nX にログインして表示された「PIN番号」を入力してください:");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("PIN: ", async (pin) => {
  rl.close();
  const loginClient = new TwitterApi({
    appKey: API_KEY,
    appSecret: API_SECRET,
    accessToken: oauth_token,
    accessSecret: oauth_token_secret,
  });
  const { accessToken, accessSecret } = await loginClient.login(pin.trim());
  console.log("\n=== アクセストークン取得成功 ===");
  console.log("X_ACCESS_TOKEN=" + accessToken);
  console.log("X_ACCESS_TOKEN_SECRET=" + accessSecret);
});
