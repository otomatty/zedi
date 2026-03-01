# Build context: repo root (docker-compose) or server/hocuspocus (Railway with Root Directory).
# When context is server/hocuspocus, bun.lock is copied there by CI or committed in repo.
FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src/ ./src/
RUN bun run build

FROM oven/bun:1-alpine AS deps

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

RUN addgroup -g 1001 -S nodejs && \
    adduser -S hocuspocus -u 1001
USER hocuspocus

ENV NODE_ENV=production
ENV PORT=1234

EXPOSE 1234

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:1234/health || exit 1

CMD ["node", "dist/index.js"]
