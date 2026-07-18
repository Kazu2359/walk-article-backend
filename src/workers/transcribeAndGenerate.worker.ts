import { Job, Worker } from "bullmq";
import { processRecordingJob } from "../services/recordingPipeline.js";
import {
  redisConnection,
  TRANSCRIBE_AND_GENERATE_QUEUE,
  type TranscribeAndGenerateJobData,
} from "../services/queue.js";

const worker = new Worker(
  TRANSCRIBE_AND_GENERATE_QUEUE,
  (job: Job<TranscribeAndGenerateJobData>) => processRecordingJob(job.data.recordingId),
  { connection: redisConnection },
);

worker.on("failed", (job, error) => {
  console.error(`recording ${job?.data.recordingId} の処理に失敗:`, error);
});
