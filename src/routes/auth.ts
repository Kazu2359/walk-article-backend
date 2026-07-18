import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { signAccessToken } from "../plugins/auth.js";
import { verifyAppleIdentityToken } from "../services/appleAuth.js";

const bodySchema = z.object({
  identityToken: z.string().min(1),
  fullName: z
    .object({
      givenName: z.string().optional(),
      familyName: z.string().optional(),
    })
    .optional(),
});

// POST /v1/auth/apple — 要件定義書 §13「認証」
export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/apple", async (request, reply) => {
    const body = bodySchema.parse(request.body);
    const { appleUserId, email } = await verifyAppleIdentityToken(body.identityToken);

    const displayName = body.fullName
      ? [body.fullName.familyName, body.fullName.givenName].filter(Boolean).join(" ") || null
      : null;

    const user = await prisma.user.upsert({
      where: { appleUserId },
      create: {
        appleUserId,
        email,
        displayName,
        settings: { create: {} },
      },
      update: email ? { email } : {},
    });

    const accessToken = signAccessToken(user.id);

    return reply.send({
      accessToken,
      user: { id: user.id, displayName: user.displayName },
    });
  });
};
