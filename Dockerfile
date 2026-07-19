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

FROM node:22-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

ENV NODE_ENV=production

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/apps/api/package.json ./apps/api/

EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
