import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockDeleteAudioObject } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn(), delete: vi.fn() },
    recording: { findMany: vi.fn() },
    pushToken: { upsert: vi.fn() },
  },
  mockDeleteAudioObject: vi.fn(),
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
  deleteAudioObject: mockDeleteAudioObject,
  downloadAudioObject: vi.fn(),
}));

const { buildApp } = await import("../../src/app.js");
const { signAccessToken } = await import("../../src/plugins/auth.js");

const USER_ID = "user-1";
const authHeader = () => ({ authorization: `Bearer ${signAccessToken(USER_ID)}` });

describe("GET /v1/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ユーザー基本情報を返す", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      displayName: "テストユーザー",
      email: "test@example.com",
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/me", headers: authHeader() });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: USER_ID, displayName: "テストユーザー", email: "test@example.com" });
  });

  it("Authorizationヘッダーがない場合は401を返す", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/me" });

    expect(response.statusCode).toBe(401);
  });
});

describe("DELETE /v1/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("音声オブジェクトを削除しユーザーを削除する", async () => {
    mockPrisma.recording.findMany.mockResolvedValue([
      { audioStorageKey: "audio/user-1/rec-1.m4a" },
      { audioStorageKey: null },
    ]);
    mockPrisma.user.delete.mockResolvedValue({});

    const app = buildApp();
    const response = await app.inject({ method: "DELETE", url: "/v1/me", headers: authHeader() });

    expect(response.statusCode).toBe(204);
    expect(mockDeleteAudioObject).toHaveBeenCalledTimes(1);
    expect(mockDeleteAudioObject).toHaveBeenCalledWith("audio/user-1/rec-1.m4a");
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: USER_ID } });
  });

  it("Authorizationヘッダーがない場合は401を返す", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "DELETE", url: "/v1/me" });

    expect(response.statusCode).toBe(401);
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });
});

describe("POST /v1/me/push-tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Expo Pushトークンを登録する", async () => {
    mockPrisma.pushToken.upsert.mockResolvedValue({});

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/me/push-tokens",
      headers: { ...authHeader(), "content-type": "application/json" },
      body: { expoPushToken: "ExponentPushToken[xxxx]" },
    });

    expect(response.statusCode).toBe(204);
    expect(mockPrisma.pushToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { expoPushToken: "ExponentPushToken[xxxx]" } }),
    );
  });

  it("expoPushTokenが空の場合は422 VALIDATION_ERRORを返す", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/me/push-tokens",
      headers: { ...authHeader(), "content-type": "application/json" },
      body: { expoPushToken: "" },
    });

    expect(response.statusCode).toBe(422);
  });

  it("Authorizationヘッダーがない場合は401を返す", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/me/push-tokens",
      headers: { "content-type": "application/json" },
      body: { expoPushToken: "ExponentPushToken[xxxx]" },
    });

    expect(response.statusCode).toBe(401);
  });
});
