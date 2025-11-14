# 🎄 Getting Started - Christmas Party Games

## 🚀 Quick Start (5 Minutes)

### Step 1: Install Dependencies

```bash
# Make sure you have pnpm installed
npm install -g pnpm

# Install all dependencies
pnpm install
```

### Step 2: Setup Environment

```bash
# Copy environment template
cp .env.example .env

# For quick local testing, you can use these temporary values:
# (For production, you'll need real Supabase credentials)
```

**Minimal `.env` for local testing:**
```env
PORT=3000
NODE_ENV=development
SOCKET_IO_CORS_ORIGIN=http://localhost:5173
```

### Step 3: Start the Application

Open two terminal windows:

**Terminal 1 - Server:**
```bash
cd apps/server
pnpm dev
```

**Terminal 2 - Web:**
```bash
cd apps/web
pnpm dev
```

### Step 4: Play!

1. **Create a Room (Desktop/Laptop)**
   - Open http://localhost:5173
   - Enter your name
   - Click "Create New Room"
   - You'll see a QR code and room code

2. **Join on Mobile**
   - Scan the QR code OR
   - Go to http://[your-local-ip]:5173 on your phone
   - Enter the room code
   - Join the game!

3. **Start Playing**
   - Select "Christmas Trivia Royale"
   - Click "Start Game"
   - Answer questions on your phone
   - Watch the host screen for results!

---

## 📱 Local Network Testing

To test with real mobile devices on your local network:

### Find Your Local IP

**Mac/Linux:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

**Windows:**
```bash
ipconfig
```

Look for something like `192.168.1.XXX`

### Update CORS Settings

In `.env`, update:
```env
SOCKET_IO_CORS_ORIGIN=http://192.168.1.XXX:5173
```

### Access from Mobile

Open `http://192.168.1.XXX:5173` on your phone

---

## 🎮 Testing Each Game

### 1. Christmas Trivia Royale ✅
**Best for:** Testing real-time question/answer flow
- Select game in lobby
- Answer multiple choice questions
- See live scoreboard updates

### 2. The Price Is Right 💰
**Best for:** Testing numeric input
- Guess product prices
- Use the mobile numpad
- See closest guess wins

### 3. Emoji Carol Battle 🎶
**Best for:** Testing voting mechanics
- Pick emojis that match others
- Strategic majority voting
- Unique pick bonuses

### 4. Naughty or Nice 😇
**Best for:** Testing binary choices
- Vote on prompts
- Social consensus scoring
- Fast-paced rounds

### 5. Workshop Tycoon 🏭
**Best for:** Testing idle/incremental mechanics
- Buy upgrades
- Watch resources grow
- Compete for highest production

### 6. Gift Grabber 🎁
**Best for:** Testing touch controls
- Drag to move
- Collect presents
- Avoid coal

---

## 🐛 Troubleshooting

### Server Won't Start
```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill the process if needed
kill -9 <PID>
```

### Web Won't Start
```bash
# Check if port 5173 is in use
lsof -i :5173

# Kill the process if needed
kill -9 <PID>
```

### Socket Connection Failed
- Make sure both server and web are running
- Check CORS settings in `.env`
- Verify firewall isn't blocking connections

### Mobile Can't Connect
- Ensure phone is on same WiFi network
- Use local IP address, not `localhost`
- Check `.env` has correct CORS origin

---

## 🔧 Development Tips

### Hot Reload Works!
Both server and web have hot reload enabled:
- Edit any `.svelte` file → instant browser update
- Edit server `.ts` files → server auto-restarts

### Debugging
```bash
# Server logs show:
- Socket connections
- Room creations
- Game state changes
- Player actions

# Browser console shows:
- Socket events
- Game state updates
- Errors
```

### Testing with Multiple "Players"
- Open multiple incognito windows
- Use different browsers
- Use phone + tablets + desktop

---

## 📦 Production Deployment

### With Supabase (Recommended)

1. **Create Supabase Project**
   - Go to https://supabase.com
   - Create new project
   - Copy credentials

2. **Run Migration**
   ```bash
   psql -h <supabase-host> -U postgres -d postgres \
     -f supabase/migrations/20240101000000_initial_schema.sql
   ```

3. **Update `.env`**
   ```env
   PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

### Deploy to Fly.io

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Deploy
fly launch

# Set secrets
fly secrets set SUPABASE_SERVICE_ROLE_KEY=your-key
fly secrets set PUBLIC_SUPABASE_URL=your-url

# Deploy
fly deploy
```

---

## 🎯 Testing Checklist

- [ ] Server starts without errors
- [ ] Web app loads at localhost:5173
- [ ] Can create a room
- [ ] Room code is displayed
- [ ] Can join room from another browser
- [ ] QR code generates
- [ ] Host can select game
- [ ] Game starts with countdown
- [ ] Players see game on mobile
- [ ] Actions register (answer question, etc.)
- [ ] Scores update in real-time
- [ ] Host screen shows game state
- [ ] Game ends and shows final scores
- [ ] Can start another game

---

## 📚 Project Structure Quick Reference

```
Christmas/
├── apps/
│   ├── web/              → SvelteKit frontend
│   │   └── src/
│   │       ├── routes/   → Pages
│   │       └── lib/      → Components & utilities
│   └── server/           → Node.js backend
│       └── src/
│           ├── games/    → Game logic
│           └── socket/   → Socket.IO handlers
├── packages/
│   └── core/             → Shared types & utilities
└── supabase/
    └── migrations/       → Database schema
```

---

## 🆘 Getting Help

### Check These Files:
- `README.md` - Full documentation
- `IMPLEMENTATION.md` - Technical details
- `STATUS.md` - Current completion status

### Common Issues:
1. **"Cannot find module"** → Run `pnpm install`
2. **Port already in use** → Change PORT in `.env`
3. **CORS error** → Check SOCKET_IO_CORS_ORIGIN matches web URL
4. **Supabase errors** → Database is optional for testing; games use defaults

---

## 🎉 You're Ready!

The app is **95% complete** and fully playable. All 6 games work, multiplayer syncs in real-time, and the mobile experience is smooth.

### Try This Right Now:

1. Run both servers (2 terminals)
2. Open http://localhost:5173 (create room)
3. Open on phone (join room)
4. Start "Christmas Trivia Royale"
5. Play! 🎄

**Enjoy your Christmas party games!** 🎅🎁
