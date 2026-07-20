import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPrisma,
  mockDownloadAudioObject,
  mockTranscribeAudio,
  mockGenerateArticles,
  mockNotifyRecordingCompleted,
} = vi.hoisted(() => ({
  mockPrisma: {
    recording: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    transcript: { create: vi.fn() },
    article: { createMany: vi.fn() },
  },
  mockDownloadAudioObject: vi.fn(),
  mockTranscribeAudio: vi.fn(),
  mockGenerateArticles: vi.fn(),
  mockNotifyRecordingCompleted: vi.fn(),
}));

vi.mock("../../src/db/client.js", () => ({ prisma: mockPrisma }));
vi.mock("../../src/services/storage.js", () => ({
  downloadAudioObject: mockDownloadAudioObject,
  createUploadUrl: vi.fn(),
  buildAudioStorageKey: vi.fn(),
  deleteAudioObject: vi.fn(),
}));
vi.mock("../../src/services/transcription.js", () => ({ transcribeAudio: mockTranscribeAudio }));
vi.mock("../../src/services/articleGeneration.js", () => ({ generateArticles: mockGenerateArticles }));
vi.mock("../../src/services/push.js", () => ({ notifyRecordingCompleted: mockNotifyRecordingCompleted }));

const { processRecordingJob } = await import("../../src/services/recordingPipeline.js");

const RECORDING = {
  id: "rec-1",
  userId: "user-1",
  audioStorageKey: "audio/user-1/rec-1.m4a",
  user: { settings: { tone: "casual" } },
};

function makeJob(attemptsMade: number, attempts: number) {
  return {
    data: { recordingId: "rec-1" },
    attemptsMade,
    opts: { attempts },
  } as never;
}

describe("processRecordingJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.recording.findUniqueOrThrow.mockResolvedValue(RECORDING);
  });

  it("成功時はcompletedまで進み記事を保存する", async () => {
    mockDownloadAudioObject.mockResolvedValue(Buffer.from("audio"));
    mockTranscribeAudio.mockResolvedValue("文字起こし結果");
    mockGenerateArticles.mockResolvedValue({ noteTitle: "タイトル", noteBody: "本文", xBody: "X用" });
    mockPrisma.recording.update.mockResolvedValue({});
    mockPrisma.transcript.create.mockResolvedValue({});
    mockPrisma.article.createMany.mockResolvedValue({});

    await processRecordingJob(makeJob(0, 3));

    expect(mockPrisma.recording.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: { status: "completed" },
    });
    expect(mockNotifyRecordingCompleted).toHaveBeenCalledWith("user-1", "rec-1");
  });

  it("リトライの余地がある失敗ではstatusをfailedにしない", async () => {
    mockDownloadAudioObject.mockRejectedValue(new Error("一時的なネットワークエラー"));

    // attempts: 3, attemptsMade: 0 → この失敗後は1回目のリトライがまだ残っている
    await expect(processRecordingJob(makeJob(0, 3))).rejects.toThrow("一時的なネットワークエラー");

    expect(mockPrisma.recording.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) }),
    );
  });

  it("最後の試行が失敗したらstatusをfailedにする", async () => {
    mockDownloadAudioObject.mockRejectedValue(new Error("恒久的なエラー"));
    mockPrisma.recording.update.mockResolvedValue({});

    // attempts: 3, attemptsMade: 2 → これが3回目（最後の試行）
    await expect(processRecordingJob(makeJob(2, 3))).rejects.toThrow("恒久的なエラー");

    expect(mockPrisma.recording.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: { status: "failed", failedReason: "恒久的なエラー" },
    });
  });
});
