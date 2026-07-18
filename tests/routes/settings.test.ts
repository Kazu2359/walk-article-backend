import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    userSettings: { findUnique: vi.fn(), update: vi.fn() },
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

describe("GET /v1/me/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("トーン・自動投稿設定を返す", async () => {
    mockPrisma.userSettings.findUnique.mockResolvedValue({
      userId: USER_ID,
      tone: "casual",
      autoPostXEnabled: false,
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/me/settings", headers: authHeader() });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ tone: "casual", autoPostXEnabled: false });
  });

  it("設定が存在しない場合は404を返す", async () => {
    mockPrisma.userSettings.findUnique.mockResolvedValue(null);

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/me/settings", headers: authHeader() });

    expect(response.statusCode).toBe(404);
  });

  it("Authorizationヘッダーがない場合は401を返す", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/me/settings" });

    expect(response.statusCode).toBe(401);
  });
});

describe("PATCH /v1/me/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("トーンを丁寧語に変更する", async () => {
    mockPrisma.userSettings.update.mockResolvedValue({
      userId: USER_ID,
      tone: "polite",
      autoPostXEnabled: false,
    });

    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/me/settings",
      headers: authHeader(),
      payload: { tone: "polite" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ tone: "polite", autoPostXEnabled: false });
    expect(mockPrisma.userSettings.update).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: { tone: "polite" },
    });
  });

  it("不正なtoneの値は422 VALIDATION_ERRORを返す", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/me/settings",
      headers: authHeader(),
      payload: { tone: "formal" },
    });

    expect(response.statusCode).toBe(422);
    expect(mockPrisma.userSettings.update).not.toHaveBeenCalled();
  });
});
