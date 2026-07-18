# 同一イメージからAPIサーバー・文字起こし/記事生成ワーカー・音声30日自動削除ワーカーの
# 3プロセスを起動できる（Railway/Fly.ioどちらも起動コマンドを変えるだけで対応可能）

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URLは未設定でも通る（prisma.config.tsがprocess.env参照、実接続はしない）
RUN npx prisma generate
RUN npm run build

FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
# prisma generateで生成された実体（.prisma/client）をprod依存の上から重ねる
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY prisma.config.ts package.json ./

EXPOSE 3000

# デフォルトはAPIサーバー。ワーカーはRailway/Fly.io側で起動コマンドを上書きする
# （worker: `node dist/workers/transcribeAndGenerate.worker.js`、
#   retention: `node dist/workers/audioRetention.worker.js`）
CMD ["node", "dist/server.js"]
