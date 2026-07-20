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

### E2Eスモークテスト（実サービスを使用）

`npm test`とは別に、実際のCloudflare R2・OpenAI Whisper・Anthropic Claude・DB/Redisを通しで確認するスモークテストを用意している。`.env`に実サービスのAPIキーを設定し、`docker compose up -d`・`npm run dev`・`npm run worker:dev`を起動した状態で実行する：

```bash
SMOKE_TEST_AUDIO_PATH=./sample.m4a npm run smoke
```

- `SMOKE_TEST_AUDIO_PATH`: 3〜10秒程度の短い`.m4a`音声ファイル（Whisperに実際に文字起こしさせるため、何か日本語で話した内容が望ましい）
- `SMOKE_TEST_BASE_URL`: 省略時は`http://localhost:3000`。Railway/Fly.ioにデプロイ済みのURLを指定すればデプロイ後の疎通確認にも使える
- Sign in with Apple自体の検証（実際にAppleが署名したidentity tokenを使う部分）は実機でしか確認できないため、このスクリプトではテストユーザーをDBに直接作成しJWTを自前発行することでバイパスしている。それ以外（録音作成→R2直PUT→アップロード完了→キュー投入→文字起こし→記事生成→記事取得）は本物のサービスを通す
- `DATABASE_URL`が向いている環境に実際のレコードを作成するため、本番DBに対して実行する場合は影響を理解した上で行うこと

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
| `npm run smoke` | E2Eスモークテスト（実サービス使用、`SMOKE_TEST_AUDIO_PATH`必須） |

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
- [x] Railway/Fly.ioへのデプロイ設定（`Dockerfile`・`fly.toml`・`railway*.json`、詳細は[DEPLOY.md](./DEPLOY.md)）
- [x] E2Eスモークテストスクリプト（`npm run smoke`）— 実サービスを使った疎通確認は実際のAPIキー・docker環境を用意してユーザー側で実行する必要あり

## 今後の計画（Phase2以降）

MVP（v1.0、App Store提出済み）の次に着手する予定の項目。要件定義書§4を参照。

- **X自動投稿（Phase2、優先度: 高）**: `POST /v1/articles/:id/post-to-x`エンドポイントを実装し、X API v2でのpay-per-use投稿に対応する。設定画面で「自動投稿」ON/OFFを切り替え可能にする（§9-2でコスト試算済み、月$6程度）
- **Note連携の再検討**: 現状は非公式APIのリスクを避け自動投稿を採用していない（§9-1）。Note側で公式APIが提供された場合は改めて対応を検討する
- **位置情報連携**: 散歩ルート・地名を記事に自動挿入する機能（要調査）
- **Whisper/Claude APIの利用量・コスト記録**: 月間コストを集計できる仕組み（現状未実装）
- **Claude API出力の異常時リトライ**: 構造化出力が不正な場合の再試行処理（現状未実装）
- **バックエンドの監視**: Sentry等によるログ・エラー監視の導入（現状未実装）
