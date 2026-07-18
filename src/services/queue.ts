import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env.js";

export const redisConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export interface TranscribeAndGenerateJobData {
  recordingId: string;
}

export const TRANSCRIBE_AND_GENERATE_QUEUE = "transcribe-and-generate";

export const transcribeAndGenerateQueue = new Queue<TranscribeAndGenerateJobData>(
  TRANSCRIBE_AND_GENERATE_QUEUE,
  { connection: redisConnection },
);

// 音声30日自動削除ジョブ（§12「音声30日自動削除ジョブ」対応）
export const AUDIO_RETENTION_QUEUE = "audio-retention";
const AUDIO_RETENTION_REPEAT_JOB_ID = "audio-retention-daily";
const AUDIO_RETENTION_CRON = "0 3 * * *"; // 毎日03:00

export const audioRetentionQueue = new Queue(AUDIO_RETENTION_QUEUE, { connection: redisConnection });

export async function scheduleAudioRetentionJob(): Promise<void> {
  await audioRetentionQueue.add(
    AUDIO_RETENTION_QUEUE,
    {},
    { repeat: { pattern: AUDIO_RETENTION_CRON }, jobId: AUDIO_RETENTION_REPEAT_JOB_ID },
  );
}
