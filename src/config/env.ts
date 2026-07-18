import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  APPLE_BUNDLE_ID: z.string().min(1),
  APPLE_TEAM_ID: z.string().optional().default(""),
  R2_ACCOUNT_ID: z.string().optional().default(""),
  R2_ACCESS_KEY_ID: z.string().optional().default(""),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(""),
  R2_BUCKET_NAME: z.string().optional().default("walk-article-audio"),
  OPENAI_API_KEY: z.string().optional().default(""),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  EXPO_ACCESS_TOKEN: z.string().optional().default(""),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("環境変数の検証に失敗しました:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
}

export const env = loadEnv();
