# ── Build stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile

COPY apps/api/ apps/api/
RUN pnpm --filter @fincherry/api build

# ── Production stage ──────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
RUN npm install -g pnpm

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/node_modules ./node_modules

RUN mkdir -p /app/uploads

EXPOSE 3000
CMD ["node", "dist/server.js"]
