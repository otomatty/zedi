# Build context: server/mcp (Railway with Root Directory = server/mcp).
# bun.lock must be present alongside package.json.
FROM oven/bun:1.3.6-alpine AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ ./src/
RUN bun run build

FROM node:24-alpine
WORKDIR /app
RUN addgroup -g 1001 -S app && adduser -S app -u 1001
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
USER app
EXPOSE 3100
CMD ["node", "dist/http.js"]
