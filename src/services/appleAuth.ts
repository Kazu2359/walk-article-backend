import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config/env.js";
import { ApiError } from "../lib/errors.js";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

// プロセス起動中はキャッシュを使い回す（joseが自動でキー更新・キャッシュを行う）
const appleJwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));

export interface AppleIdentity {
  appleUserId: string;
  email: string | null;
}

export async function verifyAppleIdentityToken(identityToken: string): Promise<AppleIdentity> {
  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(identityToken, appleJwks, {
      issuer: APPLE_ISSUER,
      audience: env.APPLE_BUNDLE_ID,
    });
    payload = result.payload;
  } catch {
    throw new ApiError("UNAUTHORIZED", "Appleのidentity tokenを検証できませんでした");
  }

  const appleUserId = payload.sub;
  if (typeof appleUserId !== "string" || appleUserId.length === 0) {
    throw new ApiError("UNAUTHORIZED", "identity tokenにsubが含まれていません");
  }

  const email = typeof payload.email === "string" ? payload.email : null;
  return { appleUserId, email };
}
