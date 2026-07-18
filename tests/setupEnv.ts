// テストは実サービスのAPIキー・実DB・実Redisなしで完結させる。
// 各外部サービス呼び出しはテストごとにvi.mockでモックするため、
// ここではzodバリデーションを通すためのダミー値のみを設定する。
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-only-jwt-secret";
process.env.APPLE_BUNDLE_ID ??= "com.example.walkarticletest";
