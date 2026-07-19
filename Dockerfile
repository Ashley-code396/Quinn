FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/agents/package.json ./packages/agents/
COPY packages/database/package.json ./packages/database/
COPY packages/scheduler/package.json ./packages/scheduler/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build --filter=@quinn/api --filter=@quinn/agents --filter=@quinn/database --filter=@quinn/scheduler --filter=@quinn/shared

RUN pnpm deploy --filter=@quinn/api /app/deploy

FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder /app/deploy .

EXPOSE 4000
CMD ["node", "dist/index.js"]
