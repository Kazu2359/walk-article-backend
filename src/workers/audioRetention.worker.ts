import { Worker } from "bullmq";
import { prisma } from "../db/client.js";
import { AUDIO_RETENTION_QUEUE, redisConnection, scheduleAudioRetentionJob } from "../services/queue.js";
import { deleteAudioObject } from "../services/storage.js";

// §12「音声30日自動削除ジョブ」: 文字起こし完了後30日で音声のみ削除し、
// transcripts・articlesは履歴閲覧のため残す
const RETENTION_DAYS = 30;
const BATCH_SIZE = 100;

async function runAudioRetention(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const targets = await prisma.recording.findMany({
    where: {
      transcriptCompletedAt: { lt: cutoff },
      audioDeletedAt: null,
      audioStorageKey: { not: null },
    },
    take: BATCH_SIZE,
  });

  for (const recording of targets) {
    if (!recording.audioStorageKey) {
      continue;
    }
    await deleteAudioObject(recording.audioStorageKey);
    await prisma.recording.update({
      where: { id: recording.id },
      data: { audioStorageKey: null, audioDeletedAt: new Date() },
    });
  }
}

const worker = new Worker(AUDIO_RETENTION_QUEUE, runAudioRetention, { connection: redisConnection });

worker.on("failed", (_job, error) => {
  console.error("音声30日自動削除ジョブが失敗しました:", error);
});

await scheduleAudioRetentionJob();
