// 実サービス（Cloudflare R2・OpenAI Whisper・Anthropic Claude）を使ったE2Eスモークテスト。
// npm test（vitest、全モック）とは別物。実際の.envとdocker-compose、npm run dev / worker:dev が
// 別ターミナルで起動している状態で、SMOKE_TEST_AUDIO_PATHに短い音声ファイルを指定して実行する。
//
//   docker compose up -d
//   npm run prisma:migrate
//   npm run dev          # 別ターミナル
//   npm run worker:dev    # 別ターミナル
//   SMOKE_TEST_AUDIO_PATH=./sample.m4a npm run smoke
//
// Sign in with Appleの検証自体は実機（実際にAppleが署名したidentity token）でしか検証できないため、
// このスクリプトではテストユーザーをDBへ直接作成しJWTを自前発行することでバイパスする。
// それ以外（録音作成→R2直PUT→アップロード完了→文字起こし→記事生成→記事取得）は本物のサービスを通す。
//
// 注意: DATABASE_URL/SMOKE_TEST_BASE_URLが向いている環境に実際のレコードを作成する。
// 本番環境に対して実行する場合は影響を理解した上で行うこと。
import "dotenv/config";
import { setTimeout as sleep } from "node:timers/promises";
import { readFile } from "node:fs/promises";
import { prisma } from "../src/db/client.js";
import { signAccessToken } from "../src/plugins/auth.js";

const BASE_URL = process.env.SMOKE_TEST_BASE_URL ?? "http://localhost:3000";
const AUDIO_PATH = process.env.SMOKE_TEST_AUDIO_PATH;
const POLL_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 3_000;

type RequestHeaders = Record<string, string>;

async function main(): Promise<void> {
  if (!AUDIO_PATH) {
    console.error(
      [
        "SMOKE_TEST_AUDIO_PATH が未設定です。",
        "実際にWhisper文字起こし→Claude記事生成のパイプラインを通すため、",
        "3〜10秒程度の短い音声ファイル（.m4a、何か日本語で話した内容）のパスを指定してください。",
        "",
        "例: SMOKE_TEST_AUDIO_PATH=./sample.m4a npm run smoke",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  const audio = await readFile(AUDIO_PATH);

  console.log("[1/7] テストユーザーを準備（Sign in with Appleは実機のみ検証可能なためDB直接作成でバイパス）");
  const user = await prisma.user.upsert({
    where: { appleUserId: "smoke-test-user" },
    create: {
      appleUserId: "smoke-test-user",
      displayName: "スモークテスト",
      settings: { create: { tone: "casual" } },
    },
    update: {},
  });
  const headers: RequestHeaders = {
    authorization: `Bearer ${signAccessToken(user.id)}`,
    "content-type": "application/json",
  };

  console.log(`[2/7] ${BASE_URL}/healthz の疎通確認`);
  const health = await fetch(`${BASE_URL}/healthz`);
  if (!health.ok) {
    throw new Error(`healthzが失敗しました: ${health.status}`);
  }

  console.log("[3/7] POST /v1/recordings（R2署名付きアップロードURLの発行）");
  const createResponse = await fetch(`${BASE_URL}/v1/recordings`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      durationSeconds: 5,
      fileSizeBytes: audio.byteLength,
      recordedAt: new Date().toISOString(),
    }),
  });
  if (!createResponse.ok) {
    throw new Error(`録音の作成に失敗しました: ${createResponse.status} ${await createResponse.text()}`);
  }
  const { recordingId, uploadUrl } = (await createResponse.json()) as {
    recordingId: string;
    uploadUrl: string;
  };
  console.log(`  recordingId = ${recordingId}`);

  console.log("[4/7] R2へ音声を直PUT");
  const putResponse = await fetch(uploadUrl, { method: "PUT", body: audio });
  if (!putResponse.ok) {
    throw new Error(`R2への音声アップロードに失敗しました: ${putResponse.status}`);
  }

  console.log("[5/7] POST /v1/recordings/:id/complete-upload（ジョブキュー投入）");
  const completeResponse = await fetch(`${BASE_URL}/v1/recordings/${recordingId}/complete-upload`, {
    method: "POST",
    headers,
  });
  if (!completeResponse.ok) {
    throw new Error(`complete-uploadに失敗しました: ${completeResponse.status}`);
  }

  console.log("[6/7] 処理完了までポーリング（workerが別途起動している必要あり）");
  const status = await pollUntilDone(recordingId, headers);
  if (status !== "completed") {
    throw new Error(`録音の処理が失敗しました（status=${status}）`);
  }

  console.log("[7/7] GET /v1/recordings/:id/articles");
  const articlesResponse = await fetch(`${BASE_URL}/v1/recordings/${recordingId}/articles`, { headers });
  if (!articlesResponse.ok) {
    throw new Error(`記事取得に失敗しました: ${articlesResponse.status}`);
  }
  const { articles } = (await articlesResponse.json()) as {
    articles: Array<{ platform: string; title: string | null; body: string }>;
  };

  console.log("\n生成された記事:");
  for (const article of articles) {
    console.log(`  - [${article.platform}] ${article.title ?? "(タイトルなし)"}: ${article.body.slice(0, 60)}...`);
  }

  console.log("\n✅ E2Eスモークテスト成功");
}

async function pollUntilDone(recordingId: string, headers: RequestHeaders): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const response = await fetch(`${BASE_URL}/v1/recordings/${recordingId}`, { headers });
    const body = (await response.json()) as { status: string; failedReason: string | null };
    console.log(`  status = ${body.status}`);
    if (body.status === "completed" || body.status === "failed") {
      if (body.status === "failed") {
        console.error(`  failedReason: ${body.failedReason}`);
      }
      return body.status;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("タイムアウト: 既定時間内に処理が完了しませんでした（workerが起動しているか確認してください）");
}

main()
  .catch((error) => {
    console.error("❌ スモークテスト失敗:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
