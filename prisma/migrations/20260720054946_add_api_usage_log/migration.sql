-- CreateEnum
CREATE TYPE "ApiService" AS ENUM ('whisper', 'claude');

-- CreateTable
CREATE TABLE "api_usage_logs" (
    "id" TEXT NOT NULL,
    "service" "ApiService" NOT NULL,
    "recording_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "cost_usd" DECIMAL(10,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_usage_logs_service_created_at_idx" ON "api_usage_logs"("service", "created_at");
