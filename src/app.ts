import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { ZodError } from "zod";
import { ApiError, toErrorBody } from "./lib/errors.js";
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

  app.register(authRoutes, { prefix: "/v1" });
  app.register(meRoutes, { prefix: "/v1" });
  app.register(recordingRoutes, { prefix: "/v1" });
  app.register(articleRoutes, { prefix: "/v1" });

  return app;
}
