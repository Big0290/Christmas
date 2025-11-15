import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomManager } from './managers/room-manager.js';
import { setupSocketHandlers } from './socket/handlers.js';
import { createSupabaseClient } from './lib/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
// Allow all origins in production (Fly.io), specific origin in development
const CORS_ORIGIN = process.env.SOCKET_IO_CORS_ORIGIN || 
  (process.env.NODE_ENV === 'production' ? '*' : 'http://localhost:5173');

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
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
});

// Initialize managers
const roomManager = new RoomManager();
const supabase = createSupabaseClient();
roomManager.setSupabaseClient(supabase);

// Setup Socket.IO handlers
setupSocketHandlers(io, roomManager, supabase);

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
