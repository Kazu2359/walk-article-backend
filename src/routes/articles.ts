import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ApiError } from "../lib/errors.js";
import { authenticate } from "../plugins/auth.js";

const patchArticleSchema = z.object({
  editedBody: z.string().min(1),
  editedTitle: z.string().optional(),
});

// 要件定義書 §13「記事」（Phase2のX自動投稿はスコープ外）
export const articleRoutes: FastifyPluginAsync = async (app) => {
  app.patch("/articles/:id", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = patchArticleSchema.parse(request.body);

    const article = await prisma.article.findFirst({
      where: { id, recording: { userId: request.userId! } },
    });
    if (!article) {
      throw new ApiError("NOT_FOUND", "記事が見つかりません");
    }

    // タイトルはNote記事のみ持つ（X記事は常にNULL、ArticlePreviewScreenの実装基準）
    const updated = await prisma.article.update({
      where: { id },
      data: {
        editedBody: body.editedBody,
        ...(article.platform === "note" && body.editedTitle ? { title: body.editedTitle } : {}),
      },
    });

    return reply.send({
      id: updated.id,
      platform: updated.platform,
      title: updated.title,
      body: updated.body,
      editedBody: updated.editedBody,
    });
  });

  app.post("/articles/:id/mark-copied", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const article = await prisma.article.findFirst({
      where: { id, recording: { userId: request.userId! } },
    });
    if (!article) {
      throw new ApiError("NOT_FOUND", "記事が見つかりません");
    }

    const updated = await prisma.article.update({ where: { id }, data: { postedAt: new Date() } });
    return reply.send({ postedAt: updated.postedAt });
  });
};
