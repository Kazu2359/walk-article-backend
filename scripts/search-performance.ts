// 履歴検索（GET /v1/recordings?query=...）の実行計画・実測時間を確認するスクリプト。
// §13の決定（個人利用・月30件想定のためpg_trgm等の全文検索基盤は導入しない）が、
// 現在のデータ量でも問題ないかを確認する目的。
//
//   DATABASE_URL="..." npx tsx scripts/search-performance.ts 散歩
//
// 検索語を省略すると "a"（ほぼ全件にヒットする想定）で実行する。
import "dotenv/config";
import { prisma } from "../src/db/client.js";

async function main(): Promise<void> {
  const query = process.argv[2] ?? "a";

  const [recordingCount, articleCount] = await Promise.all([
    prisma.recording.count(),
    prisma.article.count(),
  ]);
  console.log(`\n現在のデータ量: recordings=${recordingCount}件, articles=${articleCount}件`);
  console.log(`検索語: "${query}"\n`);

  // routes/recordings.tsのGET /v1/recordingsが発行するクエリと同等の条件で実行計画を確認する
  const plan = await prisma.$queryRaw<{ "QUERY PLAN": string }[]>`
    EXPLAIN ANALYZE
    SELECT r.id, r.recorded_at, r.status
    FROM recordings r
    WHERE EXISTS (
      SELECT 1 FROM articles a
      WHERE a.recording_id = r.id
      AND (a.title ILIKE '%' || ${query} || '%' OR a.body ILIKE '%' || ${query} || '%')
    )
    ORDER BY r.recorded_at DESC
    LIMIT 21;
  `;

  for (const row of plan) {
    console.log(row["QUERY PLAN"]);
  }
  console.log();
}

main()
  .catch((error) => {
    console.error("実行計画の取得に失敗しました:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
