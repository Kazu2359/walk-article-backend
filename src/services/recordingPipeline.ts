import type { Job } from "bullmq";
import { logClaudeUsage, logWhisperUsage } from "./apiUsage.js";
import { prisma } from "../db/client.js";
import { generateArticles } from "./articleGeneration.js";
import { notifyRecordingCompleted } from "./push.js";
import type { TranscribeAndGenerateJobData } from "./queue.js";
import { downloadAudioObject } from "./storage.js";
import { transcribeAudio } from "./transcription.js";

// 録音1件分の 音声取得→文字起こし→記事生成→通知 パイプライン。
// BullMQワーカーからも自動テストからも呼び出せるよう、キュー実装から分離している。
// job（BullMQのJob）を受け取ることで、リトライ中かどうかを判定できるようにしている。
export async function processRecordingJob(job: Job<TranscribeAndGenerateJobData>): Promise<void> {
  const { recordingId } = job.data;
  const recording = await prisma.recording.findUniqueOrThrow({
    where: { id: recordingId },
    include: { user: { include: { settings: true } } },
  });

  try {
    await prisma.recording.update({ where: { id: recordingId }, data: { status: "transcribing" } });

    if (!recording.audioStorageKey) {
      throw new Error("audioStorageKeyが未設定です");
    }
    const audio = await downloadAudioObject(recording.audioStorageKey);
    const transcriptText = await transcribeAudio(audio);
    await logWhisperUsage(recordingId, recording.durationSeconds);

    await prisma.transcript.create({ data: { recordingId, text: transcriptText } });
    await prisma.recording.update({
      where: { id: recordingId },
      data: { status: "generating", transcriptCompletedAt: new Date() },
    });

    const tone = recording.user.settings?.tone ?? "casual";
    const articles = await generateArticles(transcriptText, tone);
    await logClaudeUsage(recordingId, articles.usage.inputTokens, articles.usage.outputTokens);

    await prisma.article.createMany({
      data: [
        { recordingId, platform: "note", title: articles.noteTitle, body: articles.noteBody },
        { recordingId, platform: "x", title: null, body: articles.xBody },
      ],
    });

    await prisma.recording.update({ where: { id: recordingId }, data: { status: "completed" } });
    await notifyRecordingCompleted(recording.userId, recordingId);
  } catch (error) {
    const maxAttempts = job.opts.attempts ?? 1;
    const isLastAttempt = job.attemptsMade + 1 >= maxAttempts;
    // まだリトライの余地がある場合はstatusを"failed"にせず、アプリ側には
    // 処理中のまま見せておく（次のリトライで復帰する可能性があるため）
    if (isLastAttempt) {
      await prisma.recording.update({
        where: { id: recordingId },
        data: { status: "failed", failedReason: error instanceof Error ? error.message : "unknown error" },
      });
    }
    throw error;
  }
}
