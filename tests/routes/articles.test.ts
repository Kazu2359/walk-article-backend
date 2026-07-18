import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    article: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../../src/db/client.js", () => ({ prisma: mockPrisma }));
vi.mock("../../src/services/appleAuth.js", () => ({ verifyAppleIdentityToken: vi.fn() }));
vi.mock("../../src/services/queue.js", () => ({
  transcribeAndGenerateQueue: { add: vi.fn() },
  audioRetentionQueue: { add: vi.fn() },
  scheduleAudioRetentionJob: vi.fn(),
  redisConnection: {},
  TRANSCRIBE_AND_GENERATE_QUEUE: "transcribe-and-generate",
  AUDIO_RETENTION_QUEUE: "audio-retention",
}));
vi.mock("../../src/services/storage.js", () => ({
  createUploadUrl: vi.fn(),
  buildAudioStorageKey: vi.fn(),
  deleteAudioObject: vi.fn(),
  downloadAudioObject: vi.fn(),
}));

const { buildApp } = await import("../../src/app.js");
const { signAccessToken } = await import("../../src/plugins/auth.js");

const USER_ID = "user-1";
const authHeader = () => ({ authorization: `Bearer ${signAccessToken(USER_ID)}` });

describe("PATCH /v1/articles/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Note記事の本文とタイトルを編集する", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      id: "article-1",
      platform: "note",
      title: "元のタイトル",
      body: "元の本文",
      editedBody: null,
    });
    mockPrisma.article.update.mockResolvedValue({
      id: "article-1",
      platform: "note",
      title: "編集後タイトル",
      body: "元の本文",
      editedBody: "編集後本文",
    });

    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/articles/article-1",
      headers: authHeader(),
      payload: { editedBody: "編集後本文", editedTitle: "編集後タイトル" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: "article-1",
      platform: "note",
      title: "編集後タイトル",
      body: "元の本文",
      editedBody: "編集後本文",
    });
    expect(mockPrisma.article.update).toHaveBeenCalledWith({
      where: { id: "article-1" },
      data: { editedBody: "編集後本文", title: "編集後タイトル" },
    });
  });

  it("X記事はeditedTitleを渡してもtitleを更新しない", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      id: "article-2",
      platform: "x",
      title: null,
      body: "元のX投稿",
      editedBody: null,
    });
    mockPrisma.article.update.mockResolvedValue({
      id: "article-2",
      platform: "x",
      title: null,
      body: "元のX投稿",
      editedBody: "編集後のX投稿",
    });

    const app = buildApp();
    await app.inject({
      method: "PATCH",
      url: "/v1/articles/article-2",
      headers: authHeader(),
      payload: { editedBody: "編集後のX投稿", editedTitle: "無視されるはず" },
    });

    expect(mockPrisma.article.update).toHaveBeenCalledWith({
      where: { id: "article-2" },
      data: { editedBody: "編集後のX投稿" },
    });
  });

  it("記事が見つからない場合は404 NOT_FOUNDを返す", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);

    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/articles/missing",
      headers: authHeader(),
      payload: { editedBody: "本文" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
  });

  it("Authorizationヘッダーがない場合は401を返す", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/articles/article-1",
      payload: { editedBody: "本文" },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("POST /v1/articles/:id/mark-copied", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("コピー操作を記録しposted_atを返す", async () => {
    const postedAt = new Date("2026-07-18T09:00:00.000Z");
    mockPrisma.article.findFirst.mockResolvedValue({ id: "article-1", platform: "note" });
    mockPrisma.article.update.mockResolvedValue({ postedAt });

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/articles/article-1/mark-copied",
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().postedAt).toBe(postedAt.toISOString());
    expect(mockPrisma.article.update).toHaveBeenCalledWith({
      where: { id: "article-1" },
      data: { postedAt: expect.any(Date) },
    });
  });
});
