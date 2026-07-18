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
