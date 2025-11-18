#!/bin/bash

# Setup script for local Supabase development
# This script helps you get started with local Supabase quickly

set -e

echo "🎄 Setting up local Supabase for Christmas Party Games..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "⚠️  Supabase CLI not found. Installing..."
    echo "Please install it manually:"
    echo "  npm install -g supabase"
    echo "  or"
    echo "  brew install supabase/tap/supabase"
    exit 1
fi

echo "✅ Supabase CLI is installed"
echo ""

# Initialize Supabase if config doesn't exist
if [ ! -f "supabase/config.toml" ]; then
    echo "📝 Initializing Supabase..."
    supabase init
else
    echo "✅ Supabase config already exists"
fi

echo ""

# Start Supabase
echo "🚀 Starting Supabase..."
supabase start

echo ""
echo "✅ Supabase is running!"
echo ""
echo "📋 Connection details:"
supabase status
echo ""
echo "📝 Next steps:"
echo "1. Copy the connection details above"
echo "2. Create a .env file in the project root with:"
echo "   PUBLIC_SUPABASE_URL=http://127.0.0.1:54321"
echo "   PUBLIC_SUPABASE_ANON_KEY=<copy from above>"
echo "   SUPABASE_SERVICE_ROLE_KEY=<copy from above>"
echo ""
echo "3. Start your app with: pnpm dev:local"
echo ""
echo "🌐 Access Supabase Studio at: http://127.0.0.1:54323"
echo "📧 Access Inbucket (email testing) at: http://127.0.0.1:54324"
echo ""

