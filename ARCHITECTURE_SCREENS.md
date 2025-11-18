# Screen Architecture & User Flow

## Overview
The Christmas Party Game Suite has **three distinct screens** with specific purposes:

```
┌─────────────────────────────────────────────────────────┐
│                    USER FLOW                            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Create Room                                         │
│     └─→ /room/[code] (Host View)                       │
│                                                          │
│  2. Players Join                                        │
│     └─→ /join (Enter code) → /play/[code]             │
│                                                          │
│  3. Host Starts Game                                    │
│     └─→ /room/[code] → Click "Start" → /host/[code]   │
│                                                          │
│  4. Gameplay                                            │
│     ├─→ Players: /play/[code] (Mobile controls)        │
│     └─→ Host: /host/[code] (TV display)                │
│                                                          │
│  5. Configure Settings (Optional)                       │
│     └─→ /room/[code]/settings or /gamemaster          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 1. Room Management & Lobby

### Route: `/room/[code]`

### Purpose
- **Pre-game lobby** where players wait
- **Host control center** for starting games
- **Player roster** display (real-time)
- **Game selection** interface

### Who Sees It
- **Host** (creator of the room)
- Can be viewed on projector/TV during setup

### Key Features
- QR code for easy joining
- Live player list with scores
- Game selection tiles
- Settings button (→ `/room/[code]/settings`)
- Jukebox for background music
- Share room functionality

### Layout
```
┌─────────────────────────────────────────────────────────┐
│        Room Code: ABCD                                  │
│        [⚙️ Game Settings Button]                        │
├────────────────┬──────────────────┬──────────────────────┤
│  🎵 Jukebox    │  👥 Players (5)  │  🎮 Game Selection  │
│  📱 QR Code    │  • Alice 120pts  │  □ Trivia Royale    │
│  📤 Share      │  • Bob 85pts     │  □ Emoji Carol      │
│                │  • Carol 50pts   │  ☑ Price Is Right   │
│                │  • Dave 30pts    │  □ Naughty or Nice  │
│                │  • Eve 10pts     │                      │
│                │                  │  [▶️ START GAME]    │
└────────────────┴──────────────────┴──────────────────────┘
```

### Real-Time Updates
✅ Player joins/leaves immediately reflected  
✅ Scores update during gameplay  
✅ Connection status displayed  

### Navigation
- **To Host Screen**: Click "Start Game" → `/host/[code]`
- **To Settings**: Click "⚙️ Game Settings" → `/room/[code]/settings`

---

## 2. Host Screen (TV Display)

### Route: `/host/[code]`

### Purpose
- **Large-screen display** for projector/TV
- **Show game content** to all players
- **Display scoreboard** during gameplay
- **Visualize answers/results** in real-time

### Who Sees It
- Projected on **TV/big screen**
- Host can monitor on their device

### Key Features
- Full-screen game visuals
- Live scoreboard overlay
- Round/timer display
- Game-specific content (questions, items, prompts)
- Control panel (pause/resume)

### Layout During Gameplay
```
┌─────────────────────────────────────────────────────────┐
│  Room: ABCD    ⏸ Pause    Round 3/10          [≡ Menu] │
├─────────────────────────────────────────────────────────┤
│                                                          │
│           TRIVIA QUESTION DISPLAYED HERE                 │
│        "What year was Christmas first celebrated?"       │
│                                                          │
│         [A] 336 AD     [B] 1 AD                         │
│         [C] 500 AD     [D] 1000 AD                      │
│                                                          │
│  ┌──────────────────────────────────────────┐          │
│  │ 🏆 Live Scores (Top 5)                   │          │
│  │ 🥇 Alice    250                           │          │
│  │ 🥈 Bob      220                           │          │
│  │ 🥉 Carol    180                           │          │
│  │ #4 Dave     150                           │          │
│  │ #5 Eve      120                           │          │
│  └──────────────────────────────────────────┘          │
│                                                          │
├─────────────────────────────────────────────────────────┤
│  Alice: 250  Bob: 220  Carol: 180  Dave: 150  Eve: 120 │
└─────────────────────────────────────────────────────────┘
```

### States
- **LOBBY**: Shows "Get Ready" screen
- **STARTING**: Countdown (3...2...1...GO!)
- **PLAYING**: Game content + live scores
- **ROUND_END**: Results reveal + scoreboard
- **GAME_END**: Final results + leaderboard
- **PAUSED**: Pause screen with resume button

### Real-Time Updates
✅ Game state changes from server  
✅ Player answers/actions visualized  
✅ Scoreboard updates live  
✅ Timer countdown  

### Navigation
- **To Lobby**: After game ends or manually leave
- **Control Panel**: Right-side menu for host controls

---

## 3. Player Screen (Mobile)

### Route: `/play/[code]`

### Purpose
- **Mobile game controller** for each player
- **Submit answers/actions**
- **See personalized game state**

### Who Sees It
- Each individual **player** on their phone

### Key Features
- Touch-optimized controls
- Game-specific UI per game type
- Personal score display
- Answer submission
- Real-time feedback

### Layout Example (Trivia)
```
┌─────────────────────────┐
│  Your Score: 250 pts    │
│  Round 3/10             │
├─────────────────────────┤
│                         │
│  "What year was         │
│  Christmas first        │
│  celebrated?"           │
│                         │
│  ┌─────────────────┐   │
│  │  A) 336 AD      │   │
│  └─────────────────┘   │
│  ┌─────────────────┐   │
│  │  B) 1 AD        │   │
│  └─────────────────┘   │
│  ┌─────────────────┐   │
│  │  C) 500 AD      │   │
│  └─────────────────┘   │
│  ┌─────────────────┐   │
│  │  D) 1000 AD     │   │
│  └─────────────────┘   │
│                         │
│  ⏱️ 12s remaining      │
│                         │
└─────────────────────────┘
```

### Navigation
- Stays on `/play/[code]` throughout entire game
- UI changes based on game state

---

## 4. Settings & Configuration

### Routes
- `/room/[code]/settings` - Room-specific settings
- `/gamemaster` - Global game master dashboard

### Purpose
- Configure game settings
- Upload custom datasets
- Adjust room settings
- Manage game parameters

### Who Sees It
- **Host only** (password protected)

---

## Current Issue: Room Page Not Showing Players

### Symptoms
- Host is on `/room/[code]`
- Players successfully join (server logs confirm)
- UI shows "0 players" instead of actual count
- Player list doesn't update in real-time

### Potential Causes

#### 1. **Socket Not Connected Properly**
Check browser console for:
```
[Room] Socket connected: true
```

#### 2. **room_update Events Not Received**
Check browser console for:
```
[Room] room_update event received: {players: Array(3), playerCount: 3}
[Room] room_update: 3 players
```

#### 3. **Players Store Not Updating**
Check browser console for:
```
[Room] Players store updated: Array(3)
[Room] Players count: 3
```

#### 4. **Host Token Issue**
Check console for:
```
[Room] ✅ Host successfully connected to room
```
vs
```
[Room] ❌ Host reconnection failed: Invalid host token
```

### Debugging Steps

1. **Open browser console on `/room/[code]`**
2. **Check logs when player joins:**
   - Should see `[Socket] Room update event received` (from socket.ts)
   - Should see `[Room] room_update event received` (from room page)
   - Should see `[Room] Players store updated` reactive log
   - Should see `[Room] Players count: X` increasing

3. **Check server terminal:**
   - Should see `[Room] Player joined XXXX`
   - Should see `[Room] Emitted room_update to room XXXX with X player(s)`

4. **Verify host reconnection:**
   - Look for `[Room] ✅ Host successfully connected to room`
   - If missing, host isn't properly in the Socket.IO room

### Solution Checklist

- [ ] **Socket connected**: `$connected === true`
- [ ] **Host token valid**: No "Invalid host token" errors
- [ ] **Socket joined room**: Server logs show successful reconnect
- [ ] **room_update events received**: Console shows events arriving
- [ ] **Players store updating**: Reactive logs show array changes
- [ ] **UI reactive**: Template uses `$players` correctly

---

## Expected Behavior

### When Player Joins

**Player side:**
1. Navigate to `/join`
2. Enter room code → Submit
3. Socket emits `join_room` event
4. Redirected to `/play/[code]`

**Server:**
1. Receives `join_room` event
2. Adds player to room
3. Emits `player_joined` to room
4. Emits `room_update` with full player list

**Host side (on `/room/[code]`):**
1. Socket.IO receives `player_joined` event
2. Socket.IO receives `room_update` event
3. `socket.ts` updates `players` store via listener (line 273-282)
4. Room page reactive statement triggers (line 30-31)
5. UI updates to show new player count

---

## Architecture Summary

| Screen | Route | Purpose | Who Views | Updates |
|--------|-------|---------|-----------|---------|
| **Room Lobby** | `/room/[code]` | Pre-game setup, player list, game selection | Host (+ optional projector) | Real-time player joins/leaves |
| **Host Screen** | `/host/[code]` | TV display during gameplay | Projected on TV/screen | Real-time game state & scores |
| **Player Screen** | `/play/[code]` | Mobile game controls | Individual players | Real-time game questions/prompts |
| **Settings** | `/room/[code]/settings` | Configuration | Host only | Manual updates |
| **Game Master** | `/gamemaster` | Global settings | Admin only | Manual updates |

---

## Next Steps

1. **Test with debug logs enabled**
2. **Open `/room/[code]` in browser**
3. **Join as player from different device**
4. **Check console logs** to see where the flow breaks
5. **Share console output** if issue persists

The architecture is correct - we just need to verify that Socket.IO events are flowing properly from server → socket.ts store → room page UI.
