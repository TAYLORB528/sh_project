# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY server.ts ./

RUN npx tsc server.ts --outDir dist \
      --esModuleInterop \
      --resolveJsonModule \
      --module commonjs \
      --target es2020 \
      --moduleResolution node \
      --skipLibCheck \
    || npx tsx --version  # fallback: we'll run with tsx in prod stage

# ── Production stage ──────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm install tsx

COPY server.ts ./
COPY tsconfig.json ./

# Health check — Kubernetes uses this to know if the pod is ready
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

EXPOSE 3001

CMD ["npx", "tsx", "server.ts"]
