#!/bin/bash

# Setup script for Fly.io Upstash Redis
# This script helps provision Redis and configure it for Socket.IO clustering

set -e

echo "🚀 Setting up Fly.io Upstash Redis for Socket.IO clustering"
echo ""

# Check if fly CLI is installed
if ! command -v fly &> /dev/null; then
    echo "❌ Error: fly CLI is not installed"
    echo "   Install it from: https://fly.io/docs/getting-started/installing-flyctl/"
    exit 1
fi

# Check if logged in to Fly.io
if ! fly auth whoami &> /dev/null; then
    echo "❌ Error: Not logged in to Fly.io"
    echo "   Run: fly auth login"
    exit 1
fi

echo "✅ Fly CLI is installed and authenticated"
echo ""

# Get app name from fly.toml or prompt
# Handle both single and double quotes
APP_NAME=$(grep -E '^app = ' fly.toml 2>/dev/null | sed -E "s/app = ['\"]?([^'\"]+)['\"]?/\1/" | head -1 || echo "")

if [ -z "$APP_NAME" ]; then
    read -p "Enter your Fly.io app name: " APP_NAME
fi

# Clean up any whitespace
APP_NAME=$(echo "$APP_NAME" | xargs)

echo "📦 App name: $APP_NAME"
echo ""

# Create Redis instance
echo "Creating Upstash Redis instance..."
echo ""

REDIS_NAME="${APP_NAME}-redis"

# Check if Redis instance already exists
REDIS_EXISTS=false
if fly redis list 2>/dev/null | grep -q "$REDIS_NAME"; then
    REDIS_EXISTS=true
    echo "✅ Redis instance '$REDIS_NAME' already exists"
    read -p "Do you want to use the existing instance? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
else
    echo "Creating new Redis instance: $REDIS_NAME"
    echo "Note: This will prompt you for configuration options..."
    echo "      (Press Enter for database name, Yes for eviction, skip replicas)"
    echo ""
    
    # Get list of Redis instances before creation to detect the new one
    REDIS_LIST_BEFORE=$(fly redis list 2>/dev/null | tail -n +2 | awk '{print $1}' | sort || echo "")
    
    # Create Redis instance (non-interactive where possible)
    # The user will need to interact with prompts for eviction and replica regions
    CREATE_OUTPUT=$(fly redis create "$REDIS_NAME" --region sjc 2>&1)
    CREATE_EXIT_CODE=$?
    
    if [ $CREATE_EXIT_CODE -ne 0 ]; then
        echo ""
        echo "❌ Failed to create Redis instance"
        echo "   You may need to create it manually: fly redis create $REDIS_NAME"
        exit 1
    fi
    REDIS_EXISTS=true
    
    # Try to extract the Redis instance name and URL from the creation output
    # Look for "Your database <name> is ready" pattern
    EXTRACTED_NAME=$(echo "$CREATE_OUTPUT" | grep -iE "your database.*is ready" | grep -oE '[a-z0-9-]+' | head -1)
    
    # Try to extract Redis URL from creation output
    EXTRACTED_URL=$(echo "$CREATE_OUTPUT" | grep -oE '(redis://|rediss://)default:[^@]+@[^[:space:]]+:[0-9]+' | head -1)
    
    # Also detect by comparing before/after lists
    sleep 2  # Give Fly.io a moment to register the new instance
    REDIS_LIST_AFTER=$(fly redis list 2>/dev/null | tail -n +2 | awk '{print $1}' | sort || echo "")
    
    # Find the new Redis instance (one that wasn't in the before list)
    NEW_REDIS=$(comm -13 <(echo "$REDIS_LIST_BEFORE") <(echo "$REDIS_LIST_AFTER") | head -1)
    
    # Use extracted name if found, otherwise use the diff result
    if [ -n "$EXTRACTED_NAME" ]; then
        REDIS_NAME="$EXTRACTED_NAME"
        echo ""
        echo "ℹ️  Detected Redis instance name: $REDIS_NAME"
    elif [ -n "$NEW_REDIS" ] && [ "$NEW_REDIS" != "$REDIS_NAME" ]; then
        REDIS_NAME="$NEW_REDIS"
        echo ""
        echo "ℹ️  Fly.io created Redis with auto-generated name: $REDIS_NAME"
    fi
    
    # Store extracted URL for later use if found
    if [ -n "$EXTRACTED_URL" ]; then
        echo "ℹ️  Found Redis URL in creation output"
        CREATED_REDIS_URL="$EXTRACTED_URL"
    fi
fi

echo ""
echo "✅ Redis instance ready: $REDIS_NAME"
echo ""

# Get Redis URL
echo "Fetching Redis connection URL..."

# Use URL from creation output if available
if [ -n "$CREATED_REDIS_URL" ]; then
    REDIS_URL="$CREATED_REDIS_URL"
    echo "✅ Using Redis URL from creation output"
else
    # Try to get the Redis instance status
    ACTUAL_REDIS_NAME="$REDIS_NAME"
    if ! fly redis status "$REDIS_NAME" &>/dev/null; then
        echo "⚠️  Redis instance '$REDIS_NAME' not found"
        echo "   Listing available Redis instances..."
        fly redis list 2>/dev/null | head -10
        echo ""
        read -p "Enter the actual Redis instance name (or press Enter to use '$REDIS_NAME'): " USER_REDIS_NAME
        if [ -n "$USER_REDIS_NAME" ]; then
            ACTUAL_REDIS_NAME="$USER_REDIS_NAME"
        fi
    fi

    # Get full status output
    REDIS_STATUS=$(fly redis status "$ACTUAL_REDIS_NAME" 2>&1)

    # Try multiple patterns to extract Redis URL
    # Pattern 1: "connect to Redis at redis://..." or "Apps can connect to Redis at..."
    REDIS_URL=$(echo "$REDIS_STATUS" | grep -iE '(connect to redis at|apps.*can connect)' | grep -oE '(redis://|rediss://)[^[:space:]]+' | head -1)

    # Pattern 2: Look for redis://default:...@... pattern anywhere (most common)
    if [ -z "$REDIS_URL" ]; then
        REDIS_URL=$(echo "$REDIS_STATUS" | grep -oE '(redis://|rediss://)default:[^@]+@[^[:space:]]+:[0-9]+' | head -1)
    fi

    # Pattern 3: Look for any redis:// URL in the output
    if [ -z "$REDIS_URL" ]; then
        REDIS_URL=$(echo "$REDIS_STATUS" | grep -oE '(redis://|rediss://)[^[:space:]]+' | head -1)
    fi
fi

if [ -z "$REDIS_URL" ]; then
    echo "⚠️  Could not automatically fetch Redis URL"
    echo ""
    echo "Full Redis status output:"
    echo "----------------------------------------"
    echo "$REDIS_STATUS"
    echo "----------------------------------------"
    echo ""
    echo "Please look for a line like:"
    echo "  'Apps can connect to Redis at redis://default:...@...'"
    echo "  or"
    echo "  'Your database ... is ready. Apps ... can connect to Redis at redis://...'"
    echo ""
    read -p "Enter Redis URL (redis:// or rediss://...): " REDIS_URL
    
    # If user entered URL, validate it
    if [ -n "$REDIS_URL" ] && [[ ! "$REDIS_URL" =~ ^(redis|rediss):// ]]; then
        echo "⚠️  Warning: URL format looks incorrect. It should start with redis:// or rediss://"
    fi
fi

# Validate Redis URL format
if [[ ! "$REDIS_URL" =~ ^(redis|rediss):// ]]; then
    echo "⚠️  Warning: Redis URL doesn't start with redis:// or rediss://"
    echo "   URL: ${REDIS_URL:0:50}..."
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
fi

# Convert redis:// to rediss:// for Upstash Redis TLS
# Upstash Redis requires TLS for production use
if [[ "$REDIS_URL" =~ ^redis:// ]] && [[ "$REDIS_URL" =~ upstash ]]; then
    echo "ℹ️  Converting redis:// to rediss:// for Upstash Redis TLS..."
    REDIS_URL="${REDIS_URL/redis:\/\//rediss:\/\/}"
    echo "   Updated URL: ${REDIS_URL:0:50}..."
fi

echo ""
echo "📋 Redis URL: ${REDIS_URL:0:50}..."
echo ""

# Set Redis URL as secret
echo "Setting REDIS_URL secret..."
fly secrets set REDIS_URL="$REDIS_URL" --app "$APP_NAME" || {
    echo "❌ Failed to set REDIS_URL secret"
    exit 1
}

echo ""
echo "✅ Redis URL set as secret"
echo ""

# Update fly.toml min_machines_running if needed
CURRENT_MIN=$(grep -E 'min_machines_running' fly.toml | sed 's/.*= *\([0-9]*\).*/\1/' || echo "1")

if [ "$CURRENT_MIN" -lt 2 ]; then
    echo "⚠️  Current min_machines_running is $CURRENT_MIN"
    echo "   For horizontal scaling, you should set it to 2 or higher"
    read -p "Update min_machines_running to 2? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' 's/min_machines_running = [0-9]*/min_machines_running = 2/' fly.toml
        else
            # Linux
            sed -i 's/min_machines_running = [0-9]*/min_machines_running = 2/' fly.toml
        fi
        echo "✅ Updated fly.toml: min_machines_running = 2"
    fi
fi

echo ""
echo "🎉 Redis setup complete!"
echo ""
echo "Next steps:"
echo "1. Deploy your app: fly deploy"
echo "2. Scale to multiple instances: fly scale count 2"
echo "3. Verify Redis connection: fly ssh console -C 'curl http://localhost:3000/health'"
echo ""
echo "To check Redis status:"
echo "  fly redis status $REDIS_NAME"
echo ""
echo "To remove Redis (if needed):"
echo "  fly redis destroy $REDIS_NAME"
echo "  fly secrets unset REDIS_URL"

