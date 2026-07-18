import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockDeleteAudioObject } = vi.hoisted(() => ({
  mockPrisma: {
    recording: { findMany: vi.fn(), update: vi.fn() },
  },
  mockDeleteAudioObject: vi.fn(),
}));

vi.mock("../../src/db/client.js", () => ({ prisma: mockPrisma }));
vi.mock("../../src/services/storage.js", () => ({
  deleteAudioObject: mockDeleteAudioObject,
  createUploadUrl: vi.fn(),
  buildAudioStorageKey: vi.fn(),
  downloadAudioObject: vi.fn(),
}));

const { runAudioRetention } = await import("../../src/services/audioRetention.js");

describe("runAudioRetention（音声30日自動削除ジョブ）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("対象のR2オブジェクトを削除しaudio_storage_keyをNULL化する", async () => {
    mockPrisma.recording.findMany.mockResolvedValue([
      { id: "rec-1", audioStorageKey: "audio/user-1/rec-1.m4a" },
      { id: "rec-2", audioStorageKey: "audio/user-1/rec-2.m4a" },
    ]);
    mockDeleteAudioObject.mockResolvedValue(undefined);
    mockPrisma.recording.update.mockResolvedValue({});

    await runAudioRetention();

    expect(mockDeleteAudioObject).toHaveBeenCalledTimes(2);
    expect(mockDeleteAudioObject).toHaveBeenNthCalledWith(1, "audio/user-1/rec-1.m4a");
    expect(mockDeleteAudioObject).toHaveBeenNthCalledWith(2, "audio/user-1/rec-2.m4a");

    expect(mockPrisma.recording.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: { audioStorageKey: null, audioDeletedAt: expect.any(Date) },
    });
    expect(mockPrisma.recording.update).toHaveBeenCalledWith({
      where: { id: "rec-2" },
      data: { audioStorageKey: null, audioDeletedAt: expect.any(Date) },
    });
  });

  it("30日以内の録音・削除済み音声を検索条件から除外する", async () => {
    mockPrisma.recording.findMany.mockResolvedValue([]);

    await runAudioRetention();

    expect(mockPrisma.recording.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          transcriptCompletedAt: { lt: expect.any(Date) },
          audioDeletedAt: null,
          audioStorageKey: { not: null },
        }),
      }),
    );
    expect(mockDeleteAudioObject).not.toHaveBeenCalled();
    expect(mockPrisma.recording.update).not.toHaveBeenCalled();
  });

  it("対象が0件なら何もしない", async () => {
    mockPrisma.recording.findMany.mockResolvedValue([]);

    await runAudioRetention();

    expect(mockDeleteAudioObject).not.toHaveBeenCalled();
    expect(mockPrisma.recording.update).not.toHaveBeenCalled();
  });
});
