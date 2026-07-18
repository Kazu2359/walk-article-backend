# デプロイ手順（Railway / Fly.io）

このバックエンドは`api`（Fastify）・`worker`（文字起こし→記事生成）・`retention`（音声30日自動削除）の3プロセスで構成される。同一の`Dockerfile`イメージから起動コマンドだけを変えて3つとも動かす。

いずれの構成でも、Cloudflare R2・OpenAI・Anthropicのアカウント/APIキー（`env.sample`参照）は別途取得しておくこと。マイグレーションは開発用の`prisma migrate dev`ではなく、本番用の`prisma migrate deploy`を使う（マイグレーション履歴の適用のみ行い、スキーマ差分からの新規マイグレーション生成はしない）。

## 共通の環境変数

`env.sample`に記載の全項目を各プラットフォームのSecrets/Variablesに設定する。特に：

- `DATABASE_URL` / `REDIS_URL`: 各プラットフォームが提供するPostgres/Redisの接続文字列
- `JWT_SECRET`: `openssl rand -base64 32`で生成した本番用の値（開発用と使い回さない）
- `R2_*` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `EXPO_ACCESS_TOKEN`: 実サービスの値

## Fly.io

リポジトリに`fly.toml`を用意済み。`[processes]`で`api`/`worker`/`retention`の3プロセスグループを定義し、`[http_service]`で`api`のみHTTPを公開している（トラフィックがない間は自動停止してコストを抑える設定）。

```bash
fly launch --no-deploy        # 対話式セットアップ後、fly.tomlのapp名を実際のものに書き換える
fly postgres create           # または外部のPostgres（Neon等）を使う場合は不要
fly redis create              # Upstash Redis等の外部サービスでも可

fly secrets set \
  DATABASE_URL="postgresql://..." \
  REDIS_URL="redis://..." \
  JWT_SECRET="..." \
  APPLE_BUNDLE_ID="com.kazu2359.walkarticleapp" \
  R2_ACCOUNT_ID="..." R2_ACCESS_KEY_ID="..." R2_SECRET_ACCESS_KEY="..." R2_BUCKET_NAME="..." \
  OPENAI_API_KEY="..." ANTHROPIC_API_KEY="..." EXPO_ACCESS_TOKEN="..."

fly deploy

# 初回・スキーマ変更時のマイグレーション適用
fly ssh console -C "npx prisma migrate deploy"
```

`worker`・`retention`プロセスはHTTPを公開しないバックグラウンドプロセスとして常時起動する（`[[vm]]`の`processes`に含めているため）。

## Railway

リポジトリに`railway.json`（api用）・`railway.worker.json`（worker用）・`railway.retention.json`（retention用）を用意済み。Railwayでは1リポジトリから複数サービスを作り、各サービスのSettings → Config-as-code → *Config File Path* で該当するjsonファイルを指定する。

1. Railwayプロジェクトを作成し、Postgres・Redisプラグインを追加（`DATABASE_URL`・`REDIS_URL`は自動で払い出される）
2. GitHubリポジトリ（`Kazu2359/walk-article-backend`）から3つのサービスを作成
   - `api`: Config File Path = `railway.json`（未指定時のデフォルトでもある）
   - `worker`: Config File Path = `railway.worker.json`
   - `retention`: Config File Path = `railway.retention.json`
3. 各サービスに共通の環境変数（`env.sample`参照）を設定。`DATABASE_URL`・`REDIS_URL`はプラグインの参照変数（`${{Postgres.DATABASE_URL}}`等）を使う
4. `api`サービスのみ「Generate Domain」でパブリックURLを発行する（worker/retentionは非公開のまま）
5. 初回デプロイ後、`api`サービスのShellから`npx prisma migrate deploy`を実行してマイグレーションを適用する

## 共通の注意点

- ワーカー用プロセスは常時起動（オートスケール0を許可しない）。ジョブキュー（BullMQ）はプロセスが起動している間しか処理されない
- `audio-retention`ジョブはBullMQのrepeatable jobとして`retention`プロセス起動時に自動登録される（`scheduleAudioRetentionJob`、jobIdで重複登録を防止済み）ため、追加のcron設定は不要
- §10の非機能要件どおり、個人利用規模（月30回程度）であればRailway/Fly.ioともに無料〜低額プランで収まる想定
