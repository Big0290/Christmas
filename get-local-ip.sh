#!/bin/bash

# Get local IP address for accessing dev server from other devices

echo "🌐 Finding your local IP address..."
echo ""

# Try different methods based on OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    LOCAL_IP=$(hostname -I | awk '{print $1}')
else
    # Windows (Git Bash)
    LOCAL_IP=$(ipconfig | grep "IPv4" | awk '{print $14}' | head -1)
fi

if [ -z "$LOCAL_IP" ]; then
    echo "❌ Could not determine local IP address"
    echo ""
    echo "Manual steps:"
    echo "1. Open Network Settings"
    echo "2. Find your Wi-Fi/Ethernet connection"
    echo "3. Look for IPv4 address"
    exit 1
fi

echo "✅ Your local IP address is: $LOCAL_IP"
echo ""
echo "📱 Access your app from other devices:"
echo "   Web: http://$LOCAL_IP:5173"
echo "   Server: http://$LOCAL_IP:3000"
echo ""
echo "💡 Make sure:"
echo "   - Both devices are on the same Wi-Fi network"
echo "   - Firewall allows connections on ports 5173 and 3000"
echo "   - Dev server is running with 'host: true' in vite.config.ts"
echo ""

