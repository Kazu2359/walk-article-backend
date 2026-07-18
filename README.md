# 散歩記事化アプリ バックエンド

散歩中の音声を録音→アップロード→文字起こし→記事生成するバックエンドAPI。フロントエンド（React Native + Expo）は別リポジトリ [Kazu2359/walk-article-app](https://github.com/Kazu2359/walk-article-app) で管理。詳細な要件・データモデル・API仕様は `/home/mount/docs/散歩記事化アプリ_要件定義書.md`（§7・§12・§13）を参照。

## 技術スタック

- Node.js + TypeScript + Fastify
- PostgreSQL + Prisma（ドライバアダプタ `@prisma/adapter-pg`）
- Redis + BullMQ（非同期ジョブキュー）
- Cloudflare R2（S3互換、音声ストレージ）
- OpenAI Whisper API（文字起こし）
- Anthropic Claude API（記事生成、`claude-opus-4-8`）
- Expo Server SDK（プッシュ通知）

## フォルダ構成

```
src/
├── config/env.ts          環境変数の読み込み・バリデーション（zod）
├── db/client.ts            Prisma Client（pgドライバアダプタ経由）
├── lib/errors.ts            APIエラー共通形式（§13）
├── plugins/auth.ts          JWT発行・検証
├── routes/                  auth / recordings / articles / me
├── services/                Apple認証検証、R2署名付きURL、Whisper、Claude、Expo Push、BullMQキュー
├── workers/                  文字起こし→記事生成の非同期ワーカー、音声30日自動削除の定期ワーカー
├── app.ts                    Fastifyインスタンス構築
└── server.ts                  エントリーポイント
prisma/schema.prisma          データモデル（§12の7テーブル）
prisma.config.ts               Prisma CLI設定（Prisma 7、datasource urlはここで指定）
tests/                          自動テスト（vitest）。外部API・DB・Redisは全てモックし、実キー不要で完結
Dockerfile / fly.toml / railway*.json   デプロイ設定（詳細はDEPLOY.md参照）
```

## デプロイ

Railway / Fly.ioへのデプロイ手順は[DEPLOY.md](./DEPLOY.md)を参照。`api`（Fastify）・`worker`（文字起こし→記事生成）・`retention`（音声30日自動削除）の3プロセスを同一Dockerイメージから起動する構成。

## セットアップ

### 1. ローカルDB/Redisを起動

```bash
docker compose up -d
```

### 2. 環境変数を設定

```bash
cp env.sample .env
```

`.env`を編集し、以下を埋める：

- `JWT_SECRET`: `openssl rand -base64 32` などで生成
- `APPLE_BUNDLE_ID`: `com.kazu2359.walkarticleapp`（設定済み）
- `R2_*`: Cloudflare R2のアカウントID・アクセスキー・バケット名
- `OPENAI_API_KEY`: Whisper API用
- `ANTHROPIC_API_KEY`: Claude API用
- `EXPO_ACCESS_TOKEN`: Expo Push通知用（任意）

### 3. 依存関係インストール・DBマイグレーション

```bash
npm install
npm run prisma:migrate
```

### 4. 起動

```bash
npm run dev            # APIサーバー（http://localhost:3000）
npm run worker:dev      # 別ターミナルで文字起こし→記事生成ワーカー
npm run retention:dev   # 別ターミナルで音声30日自動削除の定期ワーカー
```

`GET /healthz` で疎通確認できる。

### 自動テストの実行

```bash
npm test
```

外部サービス（Sign in with Apple検証、Cloudflare R2、OpenAI Whisper、Anthropic Claude、Expo Push）とDB（Prisma）は全てvitestの`vi.mock`でモックしているため、`.env`やdocker-composeを起動していなくても実行できる。

## 主なコマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | APIサーバーを開発モードで起動（tsx watch） |
| `npm run worker:dev` | 文字起こし→記事生成ワーカーを開発モードで起動 |
| `npm run retention:dev` | 音声30日自動削除の定期ワーカーを開発モードで起動 |
| `npm run typecheck` | 型チェックのみ実行（`tsc --noEmit`） |
| `npm run build` | `dist/`にビルド |
| `npm run prisma:migrate` | マイグレーション作成・適用（開発用） |
| `npm run prisma:generate` | Prisma Clientの再生成 |
| `npm test` | 自動テスト実行（vitest、外部API/DB/Redisは全てモック） |

## 実装状況（Phase1: バックエンドMVP）

- [x] データモデル（`prisma/schema.prisma`）
- [x] 認証: Sign in with Apple検証 → 自前JWT発行
- [x] 録音アップロード: R2署名付きURL発行・アップロード完了通知・ステータス確認
- [x] 記事: 生成結果取得・編集・「コピーして開く」記録
- [x] 履歴: 検索・カーソルページネーション
- [x] 設定・アカウント: トーン変更・Push トークン登録・アカウント削除（App Store 5.1.1(v)対応）
- [x] 非同期ワーカー: R2から音声取得 → Whisper文字起こし → Claude記事生成 → Push通知
- [x] 音声30日自動削除ジョブ（BullMQ repeatable job、毎日03:00、§12参照）
- [x] 自動テスト（vitest）: 認証・記事取得/編集・履歴検索・設定変更・音声30日自動削除ジョブ。外部API・DB・Redisはモックし実キー不要で実行可能
- [ ] Railway/Fly.ioへのデプロイ設定
