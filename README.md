# 🎄 Christmas Party Game Suite

A production-ready multiplayer party game platform supporting 30-50 simultaneous players on mobile devices with a shared host screen.

## ✨ Features

### 6 Multiplayer Games

1. **Christmas Trivia Royale** - Fast-paced quiz with speed bonuses
2. **Gift Grabber** - Real-time Phaser canvas game
3. **Santa's Workshop Tycoon** - Resource management and upgrades
4. **Emoji Carol Battle** - Strategic emoji voting
5. **Naughty or Nice** - Social voting game
6. **The Price Is Right** - Multiplayer pricing game

### Game Master Dashboard

- Global settings (room, theme, avatars)
- Per-game customization
- Upload custom datasets (CSV/JSON)
- Real-time settings sync
- Inline editing for questions, items, prompts

### Technical Features

- Real-time Socket.IO synchronization
- Mobile-first responsive design
- QR code room joining
- Persistent leaderboards (Supabase)
- Rate limiting and anti-cheat
- Graceful reconnection
- Spectator mode

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Supabase account
- (Optional) Fly.io account for deployment

### Installation

```bash
# Clone and install
git clone <repo>
cd Christmas
pnpm install

# Copy environment template
cp .env.example .env

# Edit .env with your Supabase credentials
```

### Configuration

Update `.env`:

```env
# Supabase (https://supabase.com)
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Server
PORT=3000
SOCKET_IO_CORS_ORIGIN=http://localhost:5173

# Game Settings
MAX_PLAYERS_PER_ROOM=50
ROOM_CODE_LENGTH=4
ADMIN_PASSWORD=your-secure-password
```

### Database Setup

#### Option 1: Local Development (Recommended for Testing)

Set up Supabase locally for fast development:

```bash
# Quick setup (requires Docker)
./setup-local-supabase.sh

# Or manually:
pnpm supabase:start
pnpm supabase:status  # Copy connection details

# Create .env with local Supabase credentials
# See LOCAL_SUPABASE_SETUP.md for details
```

**Benefits:**
- No deployment needed
- Fast iteration
- Free local testing
- See [LOCAL_SUPABASE_SETUP.md](./LOCAL_SUPABASE_SETUP.md) for full guide

#### Option 2: Production Supabase

```bash
# Using Supabase CLI
supabase db push

# Or manually run migrations in Supabase dashboard:
# supabase/migrations/20240101000000_initial_schema.sql
```

### Development

```bash
# Start with local Supabase (recommended)
pnpm dev:local   # Starts Supabase + web + server

# Or start individually
pnpm dev:web     # SvelteKit on http://localhost:5173
pnpm dev:server  # Socket.IO server on http://localhost:3000

# Supabase commands
pnpm supabase:start   # Start local Supabase
pnpm supabase:stop    # Stop local Supabase
pnpm supabase:status  # Show connection details
pnpm supabase:reset   # Reset database and re-run migrations
```

**Local Supabase Services:**
- Studio: http://127.0.0.1:54323 (Database browser)
- Inbucket: http://127.0.0.1:54324 (Email testing)
- API: http://127.0.0.1:54321

---

## 📦 Project Structure

```
Christmas/
├── apps/
│   ├── web/              # SvelteKit frontend
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── +page.svelte          # Home/create room
│   │   │   │   ├── join/+page.svelte     # Join with code
│   │   │   │   ├── room/[code]/          # Game lobby
│   │   │   │   ├── host/[code]/          # Host screen (TV)
│   │   │   │   ├── play/[code]/          # Player mobile view
│   │   │   │   └── gamemaster/           # Admin dashboard
│   │   │   ├── lib/
│   │   │   │   ├── socket.ts             # Socket.IO client
│   │   │   │   └── components/           # Shared UI
│   │   │   └── hooks.server.ts
│   │   └── package.json
│   │
│   └── server/           # Node.js Socket.IO server
│       ├── src/
│       │   ├── index.ts
│       │   ├── managers/
│       │   │   └── room-manager.ts
│       │   ├── games/
│       │   │   ├── factory.ts
│       │   │   ├── trivia-royale.ts
│       │   │   ├── gift-grabber.ts
│       │   │   ├── workshop-tycoon.ts
│       │   │   ├── emoji-carol.ts
│       │   │   ├── naughty-or-nice.ts
│       │   │   └── price-is-right.ts
│       │   ├── socket/
│       │   │   └── handlers.ts
│       │   └── lib/
│       │       └── supabase.ts
│       └── package.json
│
├── packages/
│   ├── core/             # Shared types and utilities
│   │   ├── src/
│   │   │   ├── types.ts
│   │   │   ├── utils.ts
│   │   │   ├── game-engine.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── ui/               # Shared Svelte components (TODO)
│
├── supabase/
│   └── migrations/
│       └── 20240101000000_initial_schema.sql
│
├── package.json
├── turbo.json
├── .env.example
└── README.md
```

---

## 🎮 Game Master Dashboard

Access at `/gamemaster` (host-only, password-protected).

### Global Settings

- Room code length (4-8 characters)
- Max players (5-100)
- Theme colors
- Snow effect toggle
- Avatar style (festive/emoji/random)
- Spectator mode

### Per-Game Settings

Each game has customizable:
- Round count
- Time limits
- Scoring modes
- Custom datasets
- Spawn rates (Gift Grabber)
- Cost curves (Workshop)
- Content filters (Naughty/Nice)

### Custom Datasets

Upload via CSV or JSON:

**Trivia Questions** (`trivia.json`):
```json
[
  {
    "question": "What is Santa's real name?",
    "answers": ["Saint Nicholas", "Klaus", "Chris", "Nick"],
    "correctIndex": 0,
    "difficulty": "medium",
    "category": "History",
    "imageUrl": "https://..."
  }
]
```

**Price Items** (`prices.json`):
```json
[
  {
    "name": "Nintendo Switch",
    "description": "Gaming console",
    "price": 299.99,
    "imageUrl": "https://...",
    "category": "Electronics"
  }
]
```

---

## 🚢 Deployment

### Fly.io (Recommended)

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Build and deploy
pnpm build
fly launch

# Set environment variables
fly secrets set SUPABASE_SERVICE_ROLE_KEY=your-key
fly secrets set PUBLIC_SUPABASE_URL=your-url
```

### Docker

```bash
docker build -t christmas-games .
docker run -p 3000:3000 --env-file .env christmas-games
```

### Environment Variables (Production)

```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-key
SUPABASE_SERVICE_ROLE_KEY=your-key
SOCKET_IO_CORS_ORIGIN=https://your-domain.com
MAX_PLAYERS_PER_ROOM=50
ADMIN_PASSWORD=strong-password
```

---

## 🧪 Testing

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# Load testing (requires k6)
k6 run tests/load/socket-load.js
```

---

## 🎨 Customization

### Adding a New Game

1. Create game class in `apps/server/src/games/your-game.ts`
2. Extend `BaseGameEngine<YourGameState>`
3. Add to `GameFactory`
4. Create Svelte component in `apps/web/src/lib/games/`
5. Add settings schema to `packages/core/src/types.ts`

### Theming

Edit global settings or modify:
- `apps/web/src/app.css` for colors
- `apps/web/tailwind.config.js` for design tokens

---

## 📊 Architecture

### Communication Flow

```
[Mobile Players] ←→ Socket.IO ←→ [Server Game Engine] ←→ Supabase
       ↓                              ↓
[Host Screen TV] ←─── Real-time sync ─┘
```

### State Management

- **Server**: Authoritative game state in memory
- **Client**: Receives personalized state updates
- **Database**: Persistent settings and leaderboards

### Scaling

- Horizontal: Deploy multiple server instances
- Use Redis adapter for Socket.IO clustering
- Supabase handles database scaling

---

## 🐛 Troubleshooting

### Connection Issues

```bash
# Check server logs
pnpm dev:server

# Test Socket.IO connection
curl http://localhost:3000/health
```

### Database Errors

```bash
# Verify Supabase credentials
supabase status

# Reset database
supabase db reset
```

---

## 📝 License

MIT

---

## 👥 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit changes
4. Open a pull request

---

## 🎁 Credits

Built with:
- SvelteKit
- Socket.IO
- Supabase
- Phaser.js
- TailwindCSS
- TypeScript

---

For support, open an issue or contact the team.

**Merry Christmas! 🎅🎄**
