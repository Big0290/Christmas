# 🎄 Installation Guide

## ✅ Working Installation (Copy & Paste)

```bash
# 1. Go to project directory
cd /Users/jonathanmorand/Documents/ProjectsFolder/Christmas

# 2. Install pnpm (if not installed)
npm install -g pnpm

# 3. Install dependencies
pnpm install

# 4. Build the core package (REQUIRED!)
cd packages/core
pnpm build
cd ../..

# 5. Done! Now you can start the servers
```

## 🚀 Quick Setup Script

**Easiest way:**
```bash
./setup.sh
```

This script does everything for you!

## 🎮 Starting the Application

Open **TWO terminal windows:**

**Terminal 1 - Server:**
```bash
cd /Users/jonathanmorand/Documents/ProjectsFolder/Christmas/apps/server
pnpm dev
```

Wait for: `🎄 Christmas Party Games Server`

**Terminal 2 - Web:**
```bash
cd /Users/jonathanmorand/Documents/ProjectsFolder/Christmas/apps/web
pnpm dev
```

Wait for: `Local: http://localhost:5173/`

## 🌐 Access the App

- **Desktop:** http://localhost:5173
- **Phone (same WiFi):** http://192.168.x.x:5173

## ❓ Why These Steps?

1. **pnpm install** - Installs all npm packages
2. **Build core package** - Compiles TypeScript to JavaScript
   - The server and web apps import from `@christmas/core`
   - TypeScript needs to be compiled first
3. **Start servers** - Runs development servers with hot reload

## 🐛 Common Issues

### Issue: "Cannot find package '@christmas/core'"

**Solution:**
```bash
cd packages/core
pnpm build
```

You must build the core package before starting the server!

### Issue: "Port already in use"

**Solution:**
```bash
# Kill port 3000 (server)
lsof -i :3000
kill -9 <PID>

# Kill port 5173 (web)
lsof -i :5173
kill -9 <PID>
```

### Issue: "ELIFECYCLE Command failed"

**Solution:**
```bash
# Clean install
rm -rf node_modules
rm -rf packages/*/node_modules
rm -rf apps/*/node_modules
pnpm install
cd packages/core && pnpm build
```

## ✅ Verify Installation

After setup, you should have:

```
packages/core/dist/
├── game-engine.d.ts
├── game-engine.js
├── index.d.ts
├── index.js
├── types.d.ts
├── types.js
├── utils.d.ts
└── utils.js
```

If this folder doesn't exist, run `cd packages/core && pnpm build`

## 🎉 You're Ready!

Once both servers are running:
1. Open http://localhost:5173
2. Create a room
3. Scan QR code on phone
4. Play! 🎄
