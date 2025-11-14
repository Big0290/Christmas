# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm@8.15.0

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml turbo.json ./
COPY packages/core/package.json ./packages/core/
COPY apps/web/package.json ./apps/web/
COPY apps/server/package.json ./apps/server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages ./packages
COPY apps ./apps

# Build all packages
RUN pnpm build

# Production stage
FROM node:20-alpine AS runner

RUN npm install -g pnpm@8.15.0

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/web/build ./apps/web/build
COPY --from=builder /app/apps/web/package.json ./apps/web/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

EXPOSE 3000

# Start both server and web
CMD ["sh", "-c", "cd apps/server && node dist/index.js & cd apps/web && node build/index.js"]
