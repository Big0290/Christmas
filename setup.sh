#!/bin/bash

echo "🎄 Christmas Party Games - Setup Script"
echo "========================================"
echo ""

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Installing..."
    npm install -g pnpm
fi

echo "📦 Installing dependencies..."
pnpm install

echo ""
echo "🔨 Building core package..."
cd packages/core
pnpm build
cd ../..

echo ""
echo "✅ Setup complete!"
echo ""
echo "🚀 To start the application:"
echo ""
echo "Terminal 1:"
echo "  cd apps/server && pnpm dev"
echo ""
echo "Terminal 2:"
echo "  cd apps/web && pnpm dev"
echo ""
echo "Then open: http://localhost:5173"
echo ""
