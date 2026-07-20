import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { ZodError } from "zod";
import { prisma } from "./db/client.js";
import { ApiError, toErrorBody } from "./lib/errors.js";
import { adminHtml } from "./lib/adminHtml.js";
import { faqHtml } from "./lib/faqHtml.js";
import { privacyPolicyHtml } from "./lib/privacyPolicyHtml.js";
import { articleRoutes } from "./routes/articles.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { recordingRoutes } from "./routes/recordings.js";

export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  app.register(sensible);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      reply.status(error.statusCode).send(toErrorBody(error));
      return;
    }
    if (error instanceof ZodError) {
      reply
        .status(422)
        .send({ error: { code: "VALIDATION_ERROR", message: error.issues.map((i) => i.message).join(", ") } });
      return;
    }
    app.log.error(error);
    reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "予期しないエラーが発生しました" } });
  });

  app.get("/healthz", async () => ({ status: "ok" }));

  app.get("/privacy", async (_request, reply) => {
    reply.type("text/html").send(privacyPolicyHtml);
  });

  app.get("/faq", async (_request, reply) => {
    reply.type("text/html").send(faqHtml);
  });

  // 個人用の閲覧ページ（Sign in with Appleとは別の、固定パスワードのみの簡易認証）
  app.get("/admin", async (_request, reply) => {
    reply.type("text/html").send(adminHtml);
  });

  app.get("/admin/api/recordings", async (request, reply) => {
    const password = request.headers["x-admin-password"];
    if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
      throw new ApiError("UNAUTHORIZED", "パスワードが違います");
    }

    const recordings = await prisma.recording.findMany({
      where: { status: "completed" },
      include: { articles: true },
      orderBy: { recordedAt: "desc" },
    });

    return reply.send({
      recordings: recordings.map((r) => ({
        id: r.id,
        recordedAt: r.recordedAt,
        articles: r.articles.map((a) => ({
          platform: a.platform,
          title: a.title,
          body: a.editedBody ?? a.body,
        })),
      })),
    });
  });

  app.register(authRoutes, { prefix: "/v1" });
  app.register(meRoutes, { prefix: "/v1" });
  app.register(recordingRoutes, { prefix: "/v1" });
  app.register(articleRoutes, { prefix: "/v1" });

  return app;
}
