import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ApiError } from "../lib/errors.js";
import { authenticate } from "../plugins/auth.js";
import { deleteAudioObject } from "../services/storage.js";

const patchSettingsSchema = z.object({
  tone: z.enum(["casual", "polite"]).optional(),
  autoPostXEnabled: z.boolean().optional(),
});

const pushTokenSchema = z.object({
  expoPushToken: z.string().min(1),
});

// 要件定義書 §13「設定・アカウント」
export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", { preHandler: authenticate }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.userId! } });
    if (!user) {
      throw new ApiError("NOT_FOUND", "ユーザーが見つかりません");
    }
    return reply.send({ id: user.id, displayName: user.displayName, email: user.email });
  });

  // App Store審査ガイドライン5.1.1(v)対応：アカウント作成機能を持つため削除も必須
  app.delete("/me", { preHandler: authenticate }, async (request, reply) => {
    const userId = request.userId!;
    const recordings = await prisma.recording.findMany({
      where: { userId, audioStorageKey: { not: null } },
      select: { audioStorageKey: true },
    });

    await Promise.all(
      recordings
        .map((recording) => recording.audioStorageKey)
        .filter((key): key is string => Boolean(key))
        .map((key) => deleteAudioObject(key)),
    );

    // onDelete: Cascade によりsettings/recordings/transcripts/articles/pushTokens/xConnectionも削除される
    await prisma.user.delete({ where: { id: userId } });

    return reply.status(204).send();
  });

  app.get("/me/settings", { preHandler: authenticate }, async (request, reply) => {
    const settings = await prisma.userSettings.findUnique({ where: { userId: request.userId! } });
    if (!settings) {
      throw new ApiError("NOT_FOUND", "設定が見つかりません");
    }
    return reply.send({ tone: settings.tone, autoPostXEnabled: settings.autoPostXEnabled });
  });

  app.patch("/me/settings", { preHandler: authenticate }, async (request, reply) => {
    const body = patchSettingsSchema.parse(request.body);
    const settings = await prisma.userSettings.update({
      where: { userId: request.userId! },
      data: body,
    });
    return reply.send({ tone: settings.tone, autoPostXEnabled: settings.autoPostXEnabled });
  });

  app.post("/me/push-tokens", { preHandler: authenticate }, async (request, reply) => {
    const body = pushTokenSchema.parse(request.body);
    await prisma.pushToken.upsert({
      where: { expoPushToken: body.expoPushToken },
      create: { userId: request.userId!, expoPushToken: body.expoPushToken },
      update: { userId: request.userId! },
    });
    return reply.status(204).send();
  });
};
