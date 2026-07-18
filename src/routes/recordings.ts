import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ApiError } from "../lib/errors.js";
import { authenticate } from "../plugins/auth.js";
import { transcribeAndGenerateQueue } from "../services/queue.js";
import { buildAudioStorageKey, createUploadUrl } from "../services/storage.js";

// §10 非機能要件の上限
const MAX_DURATION_SECONDS = 30 * 60;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

const createRecordingSchema = z.object({
  durationSeconds: z.number().int().positive(),
  fileSizeBytes: z.number().int().positive(),
  recordedAt: z.string().datetime(),
});

const listQuerySchema = z.object({
  query: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// 要件定義書 §13「録音・処理」「履歴」
export const recordingRoutes: FastifyPluginAsync = async (app) => {
  app.post("/recordings", { preHandler: authenticate }, async (request, reply) => {
    const body = createRecordingSchema.parse(request.body);

    if (body.durationSeconds > MAX_DURATION_SECONDS) {
      throw new ApiError("DURATION_TOO_LONG", `録音は最大${MAX_DURATION_SECONDS / 60}分までです`);
    }
    if (body.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      throw new ApiError(
        "FILE_TOO_LARGE",
        `ファイルサイズは最大${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MBまでです`,
      );
    }

    const recording = await prisma.recording.create({
      data: {
        userId: request.userId!,
        status: "uploading",
        durationSeconds: body.durationSeconds,
        fileSizeBytes: body.fileSizeBytes,
        recordedAt: new Date(body.recordedAt),
      },
    });

    const storageKey = buildAudioStorageKey(recording.userId, recording.id);
    const { uploadUrl, expiresIn } = await createUploadUrl(storageKey);

    await prisma.recording.update({
      where: { id: recording.id },
      data: { audioStorageKey: storageKey },
    });

    return reply.status(201).send({ recordingId: recording.id, uploadUrl, storageKey, expiresIn });
  });

  app.post("/recordings/:id/complete-upload", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const recording = await prisma.recording.findFirst({ where: { id, userId: request.userId! } });
    if (!recording) {
      throw new ApiError("NOT_FOUND", "録音が見つかりません");
    }

    await prisma.recording.update({
      where: { id },
      data: { status: "queued", uploadedAt: new Date() },
    });

    await transcribeAndGenerateQueue.add(id, { recordingId: id });

    return reply.send({ status: "queued" });
  });

  app.get("/recordings/:id", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const recording = await prisma.recording.findFirst({ where: { id, userId: request.userId! } });
    if (!recording) {
      throw new ApiError("NOT_FOUND", "録音が見つかりません");
    }
    return reply.send({ id: recording.id, status: recording.status, failedReason: recording.failedReason });
  });

  app.get("/recordings/:id/articles", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const recording = await prisma.recording.findFirst({
      where: { id, userId: request.userId! },
      include: { articles: true },
    });
    if (!recording) {
      throw new ApiError("NOT_FOUND", "録音が見つかりません");
    }
    if (recording.status !== "completed") {
      throw new ApiError("TOO_EARLY", "記事はまだ生成中です");
    }

    return reply.send({
      articles: recording.articles.map((article) => ({
        id: article.id,
        platform: article.platform,
        title: article.title,
        body: article.body,
        editedBody: article.editedBody,
      })),
    });
  });

  app.get("/recordings", { preHandler: authenticate }, async (request, reply) => {
    const { query, cursor, limit } = listQuerySchema.parse(request.query);

    const recordings = await prisma.recording.findMany({
      where: {
        userId: request.userId!,
        ...(query
          ? {
              articles: {
                some: {
                  OR: [
                    { title: { contains: query, mode: "insensitive" } },
                    { body: { contains: query, mode: "insensitive" } },
                  ],
                },
              },
            }
          : {}),
      },
      include: { articles: { select: { platform: true, title: true, body: true } } },
      orderBy: { recordedAt: "desc" },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const hasMore = recordings.length > limit;
    const page = hasMore ? recordings.slice(0, limit) : recordings;
    const items = page.map((recording) => ({
      id: recording.id,
      recordedAt: recording.recordedAt,
      status: recording.status,
      articles: recording.articles.map((article) => ({
        platform: article.platform,
        excerpt: (article.title || article.body).slice(0, 60),
      })),
    }));

    return reply.send({
      items,
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    });
  });
};
