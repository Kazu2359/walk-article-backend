import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // `env("DATABASE_URL")`はDockerビルド時の`prisma generate`（接続不要）でも
  // 未設定だと例外を投げるため、素のprocess.env参照に変更している
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
