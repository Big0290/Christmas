#!/bin/bash

# Quick script to set Redis URL secret for an existing Redis instance

set -e

APP_NAME="christmas-party-games"

# Get app name from fly.toml if available
if [ -f fly.toml ]; then
    APP_NAME=$(grep -E '^app = ' fly.toml 2>/dev/null | sed -E "s/app = ['\"]?([^'\"]+)['\"]?/\1/" | head -1 | xargs || echo "christmas-party-games")
fi

echo "🔧 Setting Redis URL secret for app: $APP_NAME"
echo ""

# List available Redis instances
echo "Available Redis instances:"
fly redis list 2>/dev/null | head -10
echo ""

read -p "Enter Redis instance name: " REDIS_INSTANCE

if [ -z "$REDIS_INSTANCE" ]; then
    echo "❌ Redis instance name is required"
    exit 1
fi

# Get Redis status and extract URL
echo ""
echo "Fetching Redis connection URL..."
REDIS_STATUS=$(fly redis status "$REDIS_INSTANCE" 2>&1)

# Extract Redis URL
REDIS_URL=$(echo "$REDIS_STATUS" | grep -oE '(redis://|rediss://)default:[^@]+@[^[:space:]]+:[0-9]+' | head -1)

if [ -z "$REDIS_URL" ]; then
    # Try alternative pattern
    REDIS_URL=$(echo "$REDIS_STATUS" | grep -iE 'connect to redis at' | grep -oE '(redis://|rediss://)[^[:space:]]+' | head -1)
fi

if [ -z "$REDIS_URL" ]; then
    echo "⚠️  Could not automatically extract Redis URL"
    echo ""
    echo "Full status output:"
    echo "$REDIS_STATUS"
    echo ""
    read -p "Enter Redis URL manually (redis:// or rediss://...): " REDIS_URL
fi

# Convert redis:// to rediss:// for Upstash Redis TLS
if [[ "$REDIS_URL" =~ ^redis:// ]] && [[ "$REDIS_URL" =~ upstash ]]; then
    echo "ℹ️  Converting redis:// to rediss:// for Upstash Redis TLS..."
    REDIS_URL="${REDIS_URL/redis:\/\//rediss:\/\/}"
fi

echo ""
echo "📋 Redis URL: ${REDIS_URL:0:60}..."
echo ""

# Set secret
echo "Setting REDIS_URL secret..."
fly secrets set REDIS_URL="$REDIS_URL" --app "$APP_NAME" || {
    echo "❌ Failed to set REDIS_URL secret"
    exit 1
}

echo ""
echo "✅ Redis URL secret set successfully!"
echo ""
echo "Next steps:"
echo "1. Deploy: fly deploy"
echo "2. Scale: fly scale count 2"
echo "3. Verify: fly ssh console -C 'curl http://localhost:3000/health'"

