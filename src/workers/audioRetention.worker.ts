import { Worker } from "bullmq";
import { runAudioRetention } from "../services/audioRetention.js";
import { AUDIO_RETENTION_QUEUE, redisConnection, scheduleAudioRetentionJob } from "../services/queue.js";

const worker = new Worker(AUDIO_RETENTION_QUEUE, runAudioRetention, { connection: redisConnection });

worker.on("failed", (_job, error) => {
  console.error("音声30日自動削除ジョブが失敗しました:", error);
});

worker.on("error", (error) => {
  console.error("audio-retentionワーカーでエラー:", error);
});

await scheduleAudioRetentionJob();
