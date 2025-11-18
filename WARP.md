# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Essential Development Commands

**Prerequisites:** Node.js 20+ and pnpm 8+

### Installation
```bash
pnpm install
```

### Development
```bash
pnpm dev          # Runs both web + server in parallel (via Turbo)
pnpm dev:web      # SvelteKit app on http://localhost:5173
pnpm dev:server   # Express + Socket.IO server on http://localhost:3000
```

### Build
```bash
pnpm build        # Builds all workspaces via Turbo
```

### Testing
```bash
pnpm test         # Runs unit tests (Vitest)
pnpm test:e2e     # Runs E2E tests (Playwright)
```

Run a single unit test:
```bash
pnpm test -- -t "test name pattern"
pnpm test -- apps/server/src/**/*.test.ts
```

Run a single E2E test:
```bash
pnpm test:e2e -- tests/example.spec.ts -g "test name"
```

### Linting & Formatting
```bash
pnpm lint         # Runs linter across all workspaces
pnpm format       # Formats code with Prettier
```

### Database Setup
```bash
# Requires Supabase account and .env configuration
# Apply migrations from supabase/migrations/ before first use
# Using Supabase CLI:
supabase db push

# Or manually via psql:
psql -h <supabase-host> -U postgres -d postgres -f supabase/migrations/*.sql
```

---

## Architecture Overview

### Monorepo Structure
This is a **Turbo monorepo** with three workspaces:
- **apps/web**: SvelteKit frontend (mobile + host screens)
- **apps/server**: Express + Socket.IO real-time server
- **packages/core**: Shared TypeScript types and utilities

### Server-Authoritative Model
- All game logic executes on the server (`apps/server/src/games/`)
- Clients receive authoritative state snapshots and render personalized views
- Server validates all player actions before updating state
- No client-side game logic to prevent cheating

### Real-Time Communication
- Socket.IO handles bidirectional communication between:
  - **Mobile players** (30-50+ devices)
  - **Host screen** (TV/projector display)
  - **Game server** (authoritative state manager)
- Event handlers centralized in `apps/server/src/socket/handlers.ts`

### Active Games
Currently 4 games implemented:
1. **Trivia Royale** - Speed-based quiz (250 points max per question)
2. **Emoji Carol Battle** - Voting with majority + uniqueness bonuses
3. **Naughty or Nice** - Binary social voting
4. **Price Is Right** - Closest guess wins

Each game is a separate engine class extending `BaseGameEngine` with state machine lifecycle management.

### Join Flow
1. Host creates room → generates QR code + 4-digit room code
2. Players scan QR or enter code on mobile devices
3. All clients connect via Socket.IO to same room namespace
4. System synchronizes state across 30-50+ mobile devices + 1 host screen

---

## Key Implementation Patterns

### Socket Event Orchestration
**File:** `apps/server/src/socket/handlers.ts`
- Centralizes all multiplayer socket event handlers
- Routes events between players, host, and game engines
- Handles connection, disconnection, and reconnection logic

### State Flow
```
Server Game Engine (authoritative state)
    ↓
Broadcasts state updates via Socket.IO
    ↓
Clients render per-user views
```

- **Server**: Owns single source of truth
- **Broadcast**: Personalized payloads per client role (player vs host)
- **Clients**: Read-only rendering of server state

### Room Management
**File:** `apps/server/src/managers/room-manager.ts`
- Tracks active rooms and player sessions
- Handles player reconnection with 60-second grace period
- Manages room expiration and cleanup
- Restores active rooms from database on server restart

### Shared Type Contracts
**File:** `packages/core/src/types.ts`
- Defines TypeScript interfaces used by both client and server
- Zod schemas for runtime validation
- Game-specific settings and state types
- Socket.IO event type definitions

### Routing
- **Player mobile view**: `/play/[code]` - Touch-optimized game controls
- **Host screen**: `/host/[code]` - TV/projector display with scoreboard
- **Lobby**: `/room/[code]` - Pre-game waiting room
- **Game Master**: `/gamemaster` - Admin dashboard for configuration

---

## Environment Setup

Create a `.env` file in the project root with Supabase credentials:

```env
# Supabase
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

**Required before first use:**
- Supabase account and project created
- Database migrations applied from `supabase/migrations/`
- `.env` configured with valid credentials

**Development ports:**
- Web (SvelteKit): `http://localhost:5173`
- Server (Socket.IO): `http://localhost:3000`

---

## Important Context

### Project Status
- **Completion:** ~95% complete, production-ready
- **Tested for:** 50+ concurrent players with <100ms latency
- **Deployment:** Ready for Fly.io (Dockerfile + fly.toml included)

### Game Balance
Scoring systems differ significantly by game - see `SCORING_SYSTEMS.md` for details:
- Trivia Royale: Up to 250 points per question (speed bonus)
- Emoji Carol: Up to 15 points per round (majority + uniqueness)
- Naughty or Nice: Up to 10 points per round (majority only)
- Price Is Right: 100 points per round (winner-take-all)

### Key Features
- Game Master dashboard at `/gamemaster` for configuration
- Custom dataset uploads (CSV/JSON) for questions, items, prompts
- Real-time settings synchronization
- QR code room joining
- Graceful reconnection handling
- Rate limiting and anti-cheat measures

### Documentation
Comprehensive documentation available:
- `README.md` - Full project documentation and quick start
- `PROJECT_SUMMARY.md` - Technical specifications and deliverables
- `IMPLEMENTATION.md` - Implementation status and architecture details
- `SCORING_SYSTEMS.md` - Detailed scoring mechanics per game
- `STATUS.md` - Current completion status and testing guide

---

## Notes for Warp

When working in this codebase:

1. **Always start both services** for full functionality: `pnpm dev`
2. **Socket.IO events** are the primary integration point - see `handlers.ts` for all events
3. **Game engines** are server-authoritative - never trust client-side game logic
4. **Shared types** in `packages/core` must be kept in sync between client and server
5. **Mobile-first design** - test UI changes on actual mobile devices (touch targets, viewport)
6. **Database migrations** are sequential - apply in order from `supabase/migrations/`
7. **Monorepo commands** use Turbo - changes to core package require rebuild
8. **Production build** bundles both web and server - Dockerfile serves SvelteKit from Express

When adding new games:
1. Create game engine in `apps/server/src/games/your-game.ts`
2. Extend `BaseGameEngine<YourGameState>`
3. Add to `GameFactory` in `apps/server/src/games/factory.ts`
4. Create Svelte component in `apps/web/src/lib/games/YourGame.svelte`
5. Add settings schema to `packages/core/src/types.ts`
6. Update socket handlers to route game-specific events
