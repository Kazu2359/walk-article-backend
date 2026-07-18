import { Job, Worker } from "bullmq";
import { prisma } from "../db/client.js";
import { generateArticles } from "../services/articleGeneration.js";
import { notifyRecordingCompleted } from "../services/push.js";
import {
  redisConnection,
  TRANSCRIBE_AND_GENERATE_QUEUE,
  type TranscribeAndGenerateJobData,
} from "../services/queue.js";
import { downloadAudioObject } from "../services/storage.js";
import { transcribeAudio } from "../services/transcription.js";

async function processJob(job: Job<TranscribeAndGenerateJobData>): Promise<void> {
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

    await prisma.transcript.create({ data: { recordingId, text: transcriptText } });
    await prisma.recording.update({
      where: { id: recordingId },
      data: { status: "generating", transcriptCompletedAt: new Date() },
    });

    const tone = recording.user.settings?.tone ?? "casual";
    const articles = await generateArticles(transcriptText, tone);

    await prisma.article.createMany({
      data: [
        { recordingId, platform: "note", title: articles.noteTitle, body: articles.noteBody },
        { recordingId, platform: "x", title: null, body: articles.xBody },
      ],
    });

    await prisma.recording.update({ where: { id: recordingId }, data: { status: "completed" } });
    await notifyRecordingCompleted(recording.userId, recordingId);
  } catch (error) {
    await prisma.recording.update({
      where: { id: recordingId },
      data: { status: "failed", failedReason: error instanceof Error ? error.message : "unknown error" },
    });
    throw error;
  }
}

const worker = new Worker(TRANSCRIBE_AND_GENERATE_QUEUE, processJob, { connection: redisConnection });

worker.on("failed", (job, error) => {
  console.error(`recording ${job?.data.recordingId} の処理に失敗:`, error);
});
