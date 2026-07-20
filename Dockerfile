FROM node:22-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/agents/package.json ./packages/agents/
COPY packages/database/package.json ./packages/database/
COPY packages/scheduler/package.json ./packages/scheduler/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

COPY packages/database/prisma ./packages/database/prisma
RUN pnpm --filter=@quinn/database db:generate

COPY . .
RUN pnpm build --filter=@quinn/api --filter=@quinn/agents --filter=@quinn/database --filter=@quinn/scheduler --filter=@quinn/shared

FROM node:22-slim
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

ENV NODE_ENV=production

COPY --from=builder /app .

EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
