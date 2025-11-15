# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm@8.15.0

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY packages/core/package.json ./packages/core/
COPY apps/web/package.json ./apps/web/
COPY apps/server/package.json ./apps/server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages ./packages
COPY apps ./apps

# Build core package first explicitly to ensure it's available for other packages
RUN echo "Building @christmas/core package..." && \
    pnpm --filter @christmas/core build || (echo "ERROR: Core package build failed" && exit 1)

# Debug: List contents of dist folder to see what was generated
RUN echo "Contents of packages/core/dist:" && \
    ls -la /app/packages/core/dist/ 2>/dev/null || echo "dist folder doesn't exist"

# Verify the workspace package is properly built
RUN test -d /app/packages/core/dist || (echo "ERROR: dist folder not found" && exit 1)
RUN (test -f /app/packages/core/dist/index.js || test -f /app/packages/core/dist/index.mjs) || \
    (echo "ERROR: index.js/index.mjs not found in dist" && \
     echo "Files in dist:" && \
     ls -la /app/packages/core/dist/ && \
     exit 1)
RUN test -f /app/packages/core/dist/index.d.ts || (echo "ERROR: index.d.ts not found in dist" && exit 1)

# Re-link workspace dependencies after building core
# This ensures pnpm correctly resolves the built workspace package in workspace packages
# pnpm creates symlinks in each package's node_modules (e.g., apps/server/node_modules/@christmas/core)
RUN pnpm install --frozen-lockfile

# Debug: Check where workspace package is located (for debugging)
RUN echo "Checking workspace package locations:" && \
    find /app -path "*/node_modules/@christmas*" -type d -o -type l 2>/dev/null | head -5 || \
    echo "Workspace package not found in node_modules (this is okay if pnpm uses workspace protocol)"

# Build all packages (turbo will handle build order with dependsOn: ["^build"])
# Note: turbo's dependsOn ensures core is built before server/web
RUN pnpm build

# Production stage
FROM node:20-alpine AS runner

RUN npm install -g pnpm@8.15.0

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml* ./
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/web/build ./apps/web/build
COPY --from=builder /app/apps/web/package.json ./apps/web/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

EXPOSE 3000

# Start only the Express server (it serves both Socket.IO and SvelteKit static files)
CMD ["node", "apps/server/dist/index.js"]
