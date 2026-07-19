import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockQueue, mockCreateUploadUrl, mockBuildAudioStorageKey } = vi.hoisted(() => ({
  mockPrisma: {
    recording: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
  mockQueue: { add: vi.fn() },
  mockCreateUploadUrl: vi.fn(),
  mockBuildAudioStorageKey: vi.fn(),
}));

vi.mock("../../src/db/client.js", () => ({ prisma: mockPrisma }));
vi.mock("../../src/services/appleAuth.js", () => ({ verifyAppleIdentityToken: vi.fn() }));
vi.mock("../../src/services/queue.js", () => ({
  transcribeAndGenerateQueue: mockQueue,
  audioRetentionQueue: { add: vi.fn() },
  scheduleAudioRetentionJob: vi.fn(),
  redisConnection: {},
  TRANSCRIBE_AND_GENERATE_QUEUE: "transcribe-and-generate",
  AUDIO_RETENTION_QUEUE: "audio-retention",
}));
vi.mock("../../src/services/storage.js", () => ({
  createUploadUrl: mockCreateUploadUrl,
  buildAudioStorageKey: mockBuildAudioStorageKey,
  deleteAudioObject: vi.fn(),
  downloadAudioObject: vi.fn(),
}));

const { buildApp } = await import("../../src/app.js");
const { signAccessToken } = await import("../../src/plugins/auth.js");

const USER_ID = "user-1";
const authHeader = () => ({ authorization: `Bearer ${signAccessToken(USER_ID)}` });

describe("POST /v1/recordings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("録音を作成しR2署名付きアップロードURLを発行する", async () => {
    mockPrisma.recording.create.mockResolvedValue({ id: "rec-1", userId: USER_ID });
    mockPrisma.recording.update.mockResolvedValue({});
    mockBuildAudioStorageKey.mockReturnValue("audio/user-1/rec-1.m4a");
    mockCreateUploadUrl.mockResolvedValue({ uploadUrl: "https://r2.example.com/put", expiresIn: 900 });

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/recordings",
      headers: authHeader(),
      payload: { durationSeconds: 120, fileSizeBytes: 1024, recordedAt: "2026-07-18T09:00:00.000Z" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      recordingId: "rec-1",
      uploadUrl: "https://r2.example.com/put",
      storageKey: "audio/user-1/rec-1.m4a",
      expiresIn: 900,
    });
  });

  it("30分を超える録音は422 DURATION_TOO_LONGを返す", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/recordings",
      headers: authHeader(),
      payload: { durationSeconds: 1801, fileSizeBytes: 1024, recordedAt: "2026-07-18T09:00:00.000Z" },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("DURATION_TOO_LONG");
    expect(mockPrisma.recording.create).not.toHaveBeenCalled();
  });

  it("50MBを超えるファイルは422 FILE_TOO_LARGEを返す", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/recordings",
      headers: authHeader(),
      payload: { durationSeconds: 60, fileSizeBytes: 51 * 1024 * 1024, recordedAt: "2026-07-18T09:00:00.000Z" },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("FILE_TOO_LARGE");
  });
});

describe("POST /v1/recordings/:id/complete-upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("アップロード完了を記録しジョブキューに投入する", async () => {
    mockPrisma.recording.findFirst.mockResolvedValue({ id: "rec-1", userId: USER_ID });
    mockPrisma.recording.update.mockResolvedValue({});

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/recordings/rec-1/complete-upload",
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "queued" });
    expect(mockQueue.add).toHaveBeenCalledWith("rec-1", { recordingId: "rec-1" });
  });

  it("録音が見つからない場合は404を返す", async () => {
    mockPrisma.recording.findFirst.mockResolvedValue(null);

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/recordings/missing/complete-upload",
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(404);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });
});

describe("GET /v1/recordings/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ステータスを返す", async () => {
    mockPrisma.recording.findFirst.mockResolvedValue({ id: "rec-1", status: "generating", failedReason: null });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/recordings/rec-1", headers: authHeader() });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: "rec-1", status: "generating", failedReason: null });
  });

  it("見つからない場合は404を返す", async () => {
    mockPrisma.recording.findFirst.mockResolvedValue(null);

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/recordings/missing", headers: authHeader() });

    expect(response.statusCode).toBe(404);
  });
});

describe("GET /v1/recordings/:id/articles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("生成中は425 TOO_EARLYを返す", async () => {
    mockPrisma.recording.findFirst.mockResolvedValue({ id: "rec-1", status: "generating", articles: [] });

    const app = buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/recordings/rec-1/articles",
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(425);
    expect(response.json().error.code).toBe("TOO_EARLY");
  });

  it("完了済みなら記事一覧を返す", async () => {
    mockPrisma.recording.findFirst.mockResolvedValue({
      id: "rec-1",
      status: "completed",
      articles: [
        { id: "art-1", platform: "note", title: "散歩の記録", body: "本文note", editedBody: null },
        { id: "art-2", platform: "x", title: null, body: "本文x", editedBody: null },
      ],
    });

    const app = buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/recordings/rec-1/articles",
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().articles).toHaveLength(2);
  });
});

describe("GET /v1/recordings（履歴検索）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queryを指定するとタイトル・本文をILIKE検索する", async () => {
    mockPrisma.recording.findMany.mockResolvedValue([]);

    const app = buildApp();
    await app.inject({ method: "GET", url: "/v1/recordings?query=散歩&limit=2", headers: authHeader() });

    expect(mockPrisma.recording.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER_ID,
          articles: {
            some: {
              OR: [
                { title: { contains: "散歩", mode: "insensitive" } },
                { body: { contains: "散歩", mode: "insensitive" } },
              ],
            },
          },
        }),
        take: 3,
      }),
    );
  });

  it("limitを超える件数がある場合はnextCursorを返す", async () => {
    const recordedAt = new Date("2026-07-18T09:00:00.000Z");
    mockPrisma.recording.findMany.mockResolvedValue([
      { id: "rec-3", recordedAt, status: "completed", articles: [{ platform: "note", title: "3件目", body: "" }] },
      { id: "rec-2", recordedAt, status: "completed", articles: [{ platform: "note", title: "2件目", body: "" }] },
      { id: "rec-1", recordedAt, status: "completed", articles: [{ platform: "note", title: "1件目", body: "" }] },
    ]);

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/recordings?limit=2", headers: authHeader() });

    const body = response.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].id).toBe("rec-3");
    expect(body.nextCursor).toBe("rec-2");
  });

  it("該当件数がlimit以下の場合はnextCursorがnull", async () => {
    const recordedAt = new Date("2026-07-18T09:00:00.000Z");
    mockPrisma.recording.findMany.mockResolvedValue([
      { id: "rec-1", recordedAt, status: "completed", articles: [] },
    ]);

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/recordings?limit=20", headers: authHeader() });

    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
  });

  it("該当件数が0件の場合は空配列とnextCursor nullを返す", async () => {
    mockPrisma.recording.findMany.mockResolvedValue([]);

    const app = buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/recordings?query=該当なし",
      headers: authHeader(),
    });

    const body = response.json();
    expect(body.items).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it("queryを指定しない場合はarticles条件を含めず全件取得する", async () => {
    mockPrisma.recording.findMany.mockResolvedValue([]);

    const app = buildApp();
    await app.inject({ method: "GET", url: "/v1/recordings", headers: authHeader() });

    expect(mockPrisma.recording.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID },
      }),
    );
  });

  it("Authorizationヘッダーがない場合は401を返す", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/recordings" });

    expect(response.statusCode).toBe(401);
  });
});
