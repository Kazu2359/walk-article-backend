import { prisma } from "../db/client.js";

// 2026-07時点の料金（要件定義書§10参照）。変動した場合はここを更新する。
const WHISPER_COST_PER_MINUTE_USD = 0.006;
const CLAUDE_OPUS_INPUT_COST_PER_TOKEN_USD = 5 / 1_000_000;
const CLAUDE_OPUS_OUTPUT_COST_PER_TOKEN_USD = 25 / 1_000_000;

export async function logWhisperUsage(recordingId: string, durationSeconds: number): Promise<void> {
  const costUsd = (durationSeconds / 60) * WHISPER_COST_PER_MINUTE_USD;
  await prisma.apiUsageLog.create({
    data: { service: "whisper", recordingId, quantity: durationSeconds, costUsd },
  });
}

export async function logClaudeUsage(
  recordingId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  const costUsd =
    inputTokens * CLAUDE_OPUS_INPUT_COST_PER_TOKEN_USD + outputTokens * CLAUDE_OPUS_OUTPUT_COST_PER_TOKEN_USD;
  await prisma.apiUsageLog.create({
    data: { service: "claude", recordingId, quantity: inputTokens + outputTokens, costUsd },
  });
}

export interface MonthlyCostSummary {
  service: string;
  callCount: number;
  totalQuantity: number;
  totalCostUsd: number;
}

// 月間コスト集計（year: 2026, month: 1-12）
export async function getMonthlyCostSummary(year: number, month: number): Promise<MonthlyCostSummary[]> {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const groups = await prisma.apiUsageLog.groupBy({
    by: ["service"],
    where: { createdAt: { gte: start, lt: end } },
    _count: { _all: true },
    _sum: { quantity: true, costUsd: true },
  });

  return groups.map((g) => ({
    service: g.service,
    callCount: g._count._all,
    totalQuantity: g._sum.quantity ?? 0,
    totalCostUsd: Number(g._sum.costUsd ?? 0),
  }));
}
