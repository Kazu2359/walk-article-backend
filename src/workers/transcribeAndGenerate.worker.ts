import { Job, Worker } from "bullmq";
import { processRecordingJob } from "../services/recordingPipeline.js";
import {
  redisConnection,
  TRANSCRIBE_AND_GENERATE_QUEUE,
  type TranscribeAndGenerateJobData,
} from "../services/queue.js";

const worker = new Worker(
  TRANSCRIBE_AND_GENERATE_QUEUE,
  (job: Job<TranscribeAndGenerateJobData>) => processRecordingJob(job),
  { connection: redisConnection },
);

worker.on("failed", (job, error) => {
  console.error(`recording ${job?.data.recordingId} の処理に失敗:`, error);
});

// エラーイベントに何もリスナーが無いとNode.jsが未処理例外としてプロセスをクラッシュさせ、
// Fly.ioの即時再起動で再試行間隔(runRetryDelay)が効かず高速クラッシュループになるため必須
worker.on("error", (error) => {
  console.error("transcribe-and-generateワーカーでエラー:", error);
});
