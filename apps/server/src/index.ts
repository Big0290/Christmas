import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomManager } from './managers/room-manager.js';
import { AchievementManager } from './managers/achievement-manager.js';
import { setupSocketHandlers } from './socket/handlers.js';
import { createSupabaseClient } from './lib/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
// From apps/server/src/index.ts, go up 3 levels: ../../
// From apps/server/dist/index.js, go up 3 levels: ../../
// Try multiple possible paths
const possibleEnvPaths = [
  path.resolve(__dirname, '../../../.env'), // From apps/server/src or apps/server/dist
  path.resolve(__dirname, '../../.env'),   // Fallback
  path.resolve(process.cwd(), '.env'),     // From current working directory
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    console.log('[Server] ✅ Loaded .env from:', envPath);
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.warn('[Server] ⚠️  Could not load .env file. Tried:', possibleEnvPaths);
}

console.log('[Server] Environment check:');
console.log('[Server]   PUBLIC_SUPABASE_URL:', process.env.PUBLIC_SUPABASE_URL ? `found (${process.env.PUBLIC_SUPABASE_URL.substring(0, 30)}...)` : '❌ MISSING');
console.log('[Server]   PUBLIC_SUPABASE_ANON_KEY:', process.env.PUBLIC_SUPABASE_ANON_KEY ? `found (${process.env.PUBLIC_SUPABASE_ANON_KEY.substring(0, 30)}...)` : '❌ MISSING');
console.log('[Server]   SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'found' : '❌ MISSING');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0'; // 0.0.0.0 exposes to all network interfaces
// Allow all origins in production (Fly.io), specific origin in development
// In development, allow localhost and local network IPs
const CORS_ORIGIN = process.env.SOCKET_IO_CORS_ORIGIN || 
  (process.env.NODE_ENV === 'production' ? '*' : '*'); // Allow all origins in dev for local network access

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Config endpoint - serves environment variables to the client
// This allows Fly.io secrets to be available at runtime even if not at build time
app.get('/config', (req, res) => {
  res.json({
    PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL || '',
    PUBLIC_SUPABASE_ANON_KEY: process.env.PUBLIC_SUPABASE_ANON_KEY || '',
  });
});

// Background music API endpoint - list available tracks
// This is needed because adapter-static doesn't handle API routes in production
app.get('/api/background-music', async (req, res) => {
  try {
    const { readdir } = await import('fs/promises');
    const { join } = await import('path');
    
    const cwd = process.cwd();
    const isProduction = process.env.NODE_ENV === 'production';
    
    // In production, static files are copied to build directory by SvelteKit
    // In development, they're in the static directory
    const possiblePaths = isProduction
      ? [
          // Production: check build directory (where SvelteKit copies static files)
          join(cwd, 'apps', 'web', 'build', 'audio', 'background-music'),
          join(cwd, 'apps', 'web', 'static', 'audio', 'background-music'), // Fallback
        ]
      : [
          // Development: check static directory
          join(cwd, 'apps', 'web', 'static', 'audio', 'background-music'),
          join(cwd, 'static', 'audio', 'background-music'), // Fallback if running from apps/web
        ];
    
    let audioDir: string | null = null;
    let files: string[] = [];
    
    for (const dirPath of possiblePaths) {
      try {
        files = await readdir(dirPath);
        audioDir = dirPath;
        break;
      } catch (err) {
        continue;
      }
    }
    
    if (!audioDir || files.length === 0) {
      console.warn('[API] Could not find background-music directory.');
      console.warn('[API] Environment:', isProduction ? 'production' : 'development');
      console.warn('[API] Current working directory:', cwd);
      console.warn('[API] Tried paths:', possiblePaths);
      return res.json({ tracks: [] });
    }
    
    const audioFiles = files
      .filter(file => /\.(mp3|ogg|wav|m4a)$/i.test(file))
      .map(file => ({
        filename: file,
        displayName: file.replace(/\.(mp3|ogg|wav|m4a)$/i, '').replace(/[-_]/g, ' '),
        path: `/audio/background-music/${file}`
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    
    console.log(`[API] Found ${audioFiles.length} tracks in ${audioDir}`);
    res.json({ tracks: audioFiles });
  } catch (error) {
    console.error('[API] Error listing background music:', error);
    res.status(500).json({ tracks: [] });
  }
});

// Serve SvelteKit static files in production
if (process.env.NODE_ENV === 'production') {
  const webBuildPath = path.join(__dirname, '../../web/build');
  
  // Serve static files
  app.use(express.static(webBuildPath));
  
  // Handle SvelteKit routes - serve index.html for all non-API routes
  // This allows client-side routing to work
  app.get('*', (req, res, next) => {
    // Don't serve index.html for API routes, socket.io, or health check
    if (
      req.path.startsWith('/socket.io') || 
      req.path.startsWith('/health') ||
      req.path.startsWith('/api') ||
      req.path.startsWith('/config') ||
      req.path.startsWith('/_app') // SvelteKit assets
    ) {
      return next();
    }
    
    // Check if it's a file request (has extension)
    if (req.path.includes('.')) {
      return next();
    }
    
    // Serve index.html for all routes (client-side routing)
    res.sendFile(path.join(webBuildPath, 'index.html'), (err) => {
      if (err) {
        next(err);
      }
    });
  });
}

// HTTP server
const httpServer = createServer(app);

// Socket.IO server
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  // Increase max message size to allow image uploads (5MB base64 = ~6.7MB encoded)
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB to handle 5MB files in base64
  // Allow auth token in handshake
  allowRequest: async (req, callback) => {
    // Allow all connections - we'll verify auth per-event
    callback(null, true);
  },
});

// Initialize managers
const roomManager = new RoomManager();
const achievementManager = new AchievementManager();
const supabase = createSupabaseClient();
roomManager.setSupabaseClient(supabase);
achievementManager.setSupabaseClient(supabase);

// Restore active rooms from database on startup
roomManager.restoreActiveRooms().then((count) => {
  if (count > 0) {
    console.log(`[Startup] Restored ${count} active room(s) from database`);
  }
}).catch((error) => {
  console.error('[Startup] Failed to restore rooms:', error);
});

// Setup Socket.IO handlers
setupSocketHandlers(io, roomManager, supabase, achievementManager);

// Cleanup expired rooms every 5 minutes
setInterval(() => {
  roomManager.cleanupExpiredRooms();
  console.log(`[Cleanup] Removed expired rooms. Active rooms: ${roomManager.getActiveRoomCount()}`);
}, 5 * 60 * 1000);

// Start server
httpServer.listen(PORT, HOST, () => {
  console.log(`🎄 Christmas Party Games Server`);
  console.log(`   Server running on http://${HOST}:${PORT}`);
  console.log(`   Socket.IO ready for connections`);
  console.log(`   CORS origin: ${CORS_ORIGIN}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
