// Whisper/Claude APIの月間利用量・コストを表示するスクリプト。
// DATABASE_URLが向いている環境（ローカル/本番）に対して集計する。
//
//   DATABASE_URL="..." npx tsx scripts/cost-summary.ts 2026 7
//
// 年・月を省略すると、実行時点の年月を対象にする。
import "dotenv/config";
import { prisma } from "../src/db/client.js";
import { getMonthlyCostSummary } from "../src/services/apiUsage.js";

async function main(): Promise<void> {
  const now = new Date();
  const year = Number(process.argv[2] ?? now.getFullYear());
  const month = Number(process.argv[3] ?? now.getMonth() + 1);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    console.error("使い方: npx tsx scripts/cost-summary.ts <year> <month>");
    process.exitCode = 1;
    return;
  }

  const summary = await getMonthlyCostSummary(year, month);

  console.log(`\n${year}年${month}月のAPI利用量・コスト\n`);

  if (summary.length === 0) {
    console.log("  この月の記録はありません。");
    return;
  }

  let totalCostUsd = 0;
  for (const row of summary) {
    console.log(
      `  ${row.service.padEnd(8)} 呼び出し ${String(row.callCount).padStart(4)}回 / 利用量合計 ${row.totalQuantity} / コスト $${row.totalCostUsd.toFixed(4)}`,
    );
    totalCostUsd += row.totalCostUsd;
  }
  console.log(`\n  合計: $${totalCostUsd.toFixed(4)}\n`);
}

main()
  .catch((error) => {
    console.error("集計に失敗しました:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
