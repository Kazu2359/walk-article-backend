import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

const { mockPrisma, mockVerifyAppleIdentityToken } = vi.hoisted(() => ({
  mockPrisma: {
    user: { upsert: vi.fn() },
  },
  mockVerifyAppleIdentityToken: vi.fn(),
}));

vi.mock("../../src/db/client.js", () => ({ prisma: mockPrisma }));
vi.mock("../../src/services/appleAuth.js", () => ({
  verifyAppleIdentityToken: mockVerifyAppleIdentityToken,
}));
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

describe("POST /v1/auth/apple", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Apple identity tokenを検証しJWTを発行する", async () => {
    mockVerifyAppleIdentityToken.mockResolvedValue({ appleUserId: "apple-user-1", email: "walker@example.com" });
    mockPrisma.user.upsert.mockResolvedValue({ id: "user-1", displayName: null });

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/apple",
      payload: { identityToken: "fake-identity-token" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user).toEqual({ id: "user-1", displayName: null });
    expect(typeof body.accessToken).toBe("string");

    const decoded = jwt.verify(body.accessToken, "test-only-jwt-secret") as { sub: string };
    expect(decoded.sub).toBe("user-1");

    expect(mockPrisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { appleUserId: "apple-user-1" },
        create: expect.objectContaining({ appleUserId: "apple-user-1", email: "walker@example.com" }),
      }),
    );
  });

  it("初回ログインのfullNameからdisplayNameを組み立てる", async () => {
    mockVerifyAppleIdentityToken.mockResolvedValue({ appleUserId: "apple-user-2", email: null });
    mockPrisma.user.upsert.mockResolvedValue({ id: "user-2", displayName: "山田 太郎" });

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/apple",
      payload: {
        identityToken: "fake-identity-token",
        fullName: { familyName: "山田", givenName: "太郎" },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mockPrisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ displayName: "山田 太郎" }),
      }),
    );
  });

  it("identityTokenがない場合は422 VALIDATION_ERRORを返す", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "POST", url: "/v1/auth/apple", payload: {} });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("Apple側の検証に失敗したら401 UNAUTHORIZEDを返す", async () => {
    const { ApiError } = await import("../../src/lib/errors.js");
    mockVerifyAppleIdentityToken.mockRejectedValue(
      new ApiError("UNAUTHORIZED", "Appleのidentity tokenを検証できませんでした"),
    );

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/apple",
      payload: { identityToken: "invalid-token" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");
  });
});
