import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import cors from 'cors';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { RoomManager } from './managers/room-manager.js';
import { AchievementManager } from './managers/achievement-manager.js';
import { RoomEngine } from './engine/room-engine.js';
import { setupSocketHandlers } from './socket/handlers.js';
import { createSupabaseClient } from './lib/supabase.js';
import { initializeRedis, checkRedisHealth, closeRedis } from './lib/redis.js';

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
console.log('[Server]   REDIS_URL:', process.env.REDIS_URL ? `found (${process.env.REDIS_URL.replace(/:[^:@]+@/, ':****@').substring(0, 50)}...)` : '❌ NOT SET (using in-memory adapter)');

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
app.get('/health', async (req, res) => {
  const redisHealth = await checkRedisHealth();
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    redis: redisHealth ? 'connected' : 'disconnected',
    adapter: redisAdapterInitialized ? 'redis' : 'memory'
  });
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

// Serve SvelteKit app with SSR support in production
if (process.env.NODE_ENV === 'production') {
  // Use IIFE to handle async import
  (async () => {
    try {
      // Import the SvelteKit handler (built by adapter-node)
      // Convert to file:// URL for ES module import
      const handlerPath = path.join(__dirname, '../../web/build/handler.js');
      const handlerUrl = pathToFileURL(handlerPath).href;
      console.log('[Server] Attempting to load handler from:', handlerUrl);
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - Module path is dynamic and file doesn't exist at compile time
      const handlerModule = await import(handlerUrl);
      const handler = handlerModule.handler;
      
      console.log('[Server] ✅ Loaded SvelteKit SSR handler');
      
      // Serve SvelteKit app - it will handle all routes except those we've defined above
      app.use((req, res, next) => {
        // Don't pass to SvelteKit if it's a server route we handle
        if (
          req.path.startsWith('/socket.io') || 
          req.path.startsWith('/health') ||
          req.path.startsWith('/config')
        ) {
          return next();
        }
        
        // Let SvelteKit handle everything else (including API routes)
        handler(req, res, next);
      });
    } catch (error) {
      console.error('[Server] Failed to load SvelteKit handler:', error);
      console.error('[Server] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      console.error('[Server] Falling back to static file serving');
      
      // Fallback to static file serving if handler not available
      // With adapter-node, static files are in build/client
      const webBuildPath = path.join(__dirname, '../../web/build');
      const staticPath = path.join(webBuildPath, 'client');
      
      // Check if client directory exists (adapter-node structure)
      const fs = await import('fs/promises');
      try {
        await fs.access(staticPath);
        console.log('[Server] Serving static files from:', staticPath);
        app.use(express.static(staticPath));
      } catch {
        // Fallback to build root if client doesn't exist
        console.log('[Server] Serving static files from:', webBuildPath);
        app.use(express.static(webBuildPath));
      }
      
      app.get('*', (req, res, next) => {
        if (
          req.path.startsWith('/socket.io') || 
          req.path.startsWith('/health') ||
          req.path.startsWith('/api') ||
          req.path.startsWith('/config') ||
          req.path.startsWith('/_app')
        ) {
          return next();
        }
        
        if (req.path.includes('.')) {
          return next();
        }
        
        // Try to serve index.html from client directory first
        const indexPath = path.join(staticPath, 'index.html');
        res.sendFile(indexPath, (err) => {
          if (err) {
            // If client/index.html doesn't exist, try build root
            const rootIndexPath = path.join(webBuildPath, 'index.html');
            res.sendFile(rootIndexPath, (err2) => {
              if (err2) {
                // Last resort: try to find any index.html
                console.error('[Server] Could not find index.html in:', staticPath, 'or', webBuildPath);
                res.status(404).send('Page not found');
              }
            });
          }
        });
      });
    }
  })();
}

// HTTP server
const httpServer = createServer(app);

// Initialize Redis and Socket.IO server
let redisAdapterInitialized = false;
let io: Server;

// Socket.IO server configuration
const socketIOConfig: any = {
  cors: {
    origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 120000, // 120 seconds (2 minutes) - increased from 60s to handle slower networks
  pingInterval: 25000, // 25 seconds - reasonable interval for ping checks
  // Increase max message size to allow image uploads (5MB base64 = ~6.7MB encoded)
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB to handle 5MB files in base64
  // Allow auth token in handshake
  allowRequest: async (req: any, callback: (err: Error | null, allow: boolean) => void): Promise<void> => {
    // Allow all connections - we'll verify auth per-event
    callback(null, true);
  },
};

// Initialize Redis adapter if REDIS_URL is set, then create Socket.IO server
(async () => {
  if (process.env.REDIS_URL) {
    try {
      console.log('[Socket.IO] Initializing Redis adapter...');
      const redisClients = await initializeRedis();
      if (redisClients) {
        const adapter = createAdapter(redisClients.pubClient, redisClients.subClient);
        socketIOConfig.adapter = adapter;
        redisAdapterInitialized = true;
        console.log('[Socket.IO] Redis adapter configured successfully');
      } else {
        console.log('[Socket.IO] Redis initialization failed, falling back to in-memory adapter');
      }
    } catch (error) {
      console.error('[Socket.IO] Failed to create Redis adapter:', error);
      console.log('[Socket.IO] Falling back to in-memory adapter');
    }
  } else {
    console.log('[Socket.IO] Using in-memory adapter (no Redis configured)');
  }

  // Create Socket.IO server after Redis initialization (if configured)
  io = new Server(httpServer, socketIOConfig);
  
  // Continue with server initialization
  initializeServer();
})();

// Server initialization function (called after Socket.IO is ready)
function initializeServer() {

  // Initialize managers
  const achievementManager = new AchievementManager();
  const supabase = createSupabaseClient();
  achievementManager.setSupabaseClient(supabase);

  // Initialize room engine (it will initialize RoomManager internally)
  const roomEngine = new RoomEngine(io, achievementManager);
  roomEngine.setSupabaseClient(supabase);

  // Restore active rooms from database on startup
  roomEngine.restoreActiveRooms().then((count) => {
    if (count > 0) {
      console.log(`[Startup] Restored ${count} active room(s) from database`);
    }
  }).catch((error) => {
    console.error('[Startup] Failed to restore rooms:', error);
  });

  // Setup Socket.IO handlers
  setupSocketHandlers(io, roomEngine, supabase, achievementManager);

  // Cleanup expired rooms every 5 minutes
  setInterval(() => {
    roomEngine.cleanupExpiredRooms();
    console.log(`[Cleanup] Removed expired rooms. Active rooms: ${roomEngine.getActiveRoomCount()}`);
  }, 5 * 60 * 1000);

  // Start server
  httpServer.listen(PORT, HOST, () => {
    console.log(`🎄 Christmas Party Games Server`);
    console.log(`   Server running on http://${HOST}:${PORT}`);
    console.log(`   Socket.IO ready for connections`);
    console.log(`   CORS origin: ${CORS_ORIGIN}`);
    console.log(`   Redis adapter: ${redisAdapterInitialized ? 'enabled' : 'disabled (in-memory)'}`);
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  httpServer.close(async () => {
    console.log('Server closed');
    await closeRedis();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing server...');
  httpServer.close(async () => {
    console.log('Server closed');
    await closeRedis();
    process.exit(0);
  });
});
