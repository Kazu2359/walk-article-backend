import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ApiError } from "../lib/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

const ACCESS_TOKEN_TTL = "90d";

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new ApiError("UNAUTHORIZED", "Authorizationヘッダーが必要です");
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
    request.userId = payload.sub;
  } catch {
    throw new ApiError("UNAUTHORIZED", "アクセストークンが無効です");
  }
}
