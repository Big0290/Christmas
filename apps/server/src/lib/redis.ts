import Redis from 'ioredis';

let redisClient: Redis | null = null;
let redisPubClient: Redis | null = null;
let redisSubClient: Redis | null = null;

/**
 * Initialize Redis client(s) for Socket.IO adapter
 * Returns pub/sub clients for Socket.IO Redis adapter
 */
export async function initializeRedis(): Promise<{
  pubClient: Redis;
  subClient: Redis;
} | null> {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.log('[Redis] REDIS_URL not set, skipping Redis initialization (using in-memory adapter)');
    return null;
  }

  // Skip Redis initialization in local development if URL points to Fly.io Upstash
  // (Fly.io Redis instances are only accessible from within Fly.io network)
  const isLocalDev = process.env.NODE_ENV !== 'production' && !process.env.FLY_APP_NAME;
  const isFlyRedis = redisUrl.includes('upstash.io') || redisUrl.includes('fly.io');
  
  if (isLocalDev && isFlyRedis) {
    console.log('[Redis] Skipping Fly.io Redis connection in local development');
    console.log('[Redis] Redis adapter: disabled (in-memory)');
    console.log('[Redis] Note: Set REDIS_URL to a local Redis instance or use production environment');
    return null;
  }

  try {
    console.log('[Redis] Initializing Redis connection...');
    console.log('[Redis] Redis URL:', redisUrl.replace(/:[^:@]+@/, ':****@')); // Hide password in logs

    // Parse Redis URL to determine if TLS is needed
    const isTLS = redisUrl.startsWith('rediss://');
    
    // Create pub client (for publishing events)
    redisPubClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        console.log(`[Redis] Retrying connection (attempt ${times}) in ${delay}ms...`);
        return delay;
      },
      enableReadyCheck: true,
      lazyConnect: true, // Connect manually to handle errors
      ...(isTLS && {
        tls: {
          rejectUnauthorized: true,
        },
      }),
    });

    // Create sub client (for subscribing to events)
    redisSubClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Subscriptions should not retry on failure
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        console.log(`[Redis] Retrying subscription connection (attempt ${times}) in ${delay}ms...`);
        return delay;
      },
      enableReadyCheck: true,
      lazyConnect: true, // Connect manually to handle errors
      ...(isTLS && {
        tls: {
          rejectUnauthorized: true,
        },
      }),
    });

    // Set up error handlers
    redisPubClient.on('error', (err: any) => {
      // Only log errors that aren't connection-related in local dev
      const isConnectionError = err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED';
      const isLocalDev = process.env.NODE_ENV !== 'production' && !process.env.FLY_APP_NAME;
      
      if (isConnectionError && isLocalDev) {
        console.warn('[Redis] Cannot connect to Redis in local development (expected if using Fly.io Redis)');
        console.warn('[Redis] Redis adapter: disabled (in-memory)');
      } else {
        console.error('[Redis] Pub client error:', err);
      }
    });

    redisSubClient.on('error', (err: any) => {
      // Only log errors that aren't connection-related in local dev
      const isConnectionError = err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED';
      const isLocalDev = process.env.NODE_ENV !== 'production' && !process.env.FLY_APP_NAME;
      
      if (isConnectionError && isLocalDev) {
        // Already logged by pub client, don't duplicate
      } else {
        console.error('[Redis] Sub client error:', err);
      }
    });

    redisPubClient.on('connect', () => {
      console.log('[Redis] Pub client connected');
    });

    redisSubClient.on('connect', () => {
      console.log('[Redis] Sub client connected');
    });

    redisPubClient.on('ready', () => {
      console.log('[Redis] Pub client ready');
    });

    redisSubClient.on('ready', () => {
      console.log('[Redis] Sub client ready');
    });

    // Wait for both clients to be ready with timeout
    const connectionTimeout = 5000; // 5 seconds
    const connectPromise = Promise.all([
      redisPubClient.connect(),
      redisSubClient.connect(),
    ]);

    try {
      await Promise.race([
        connectPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), connectionTimeout)
        ),
      ]);

      console.log('[Redis] Redis clients initialized successfully');
      return {
        pubClient: redisPubClient,
        subClient: redisSubClient,
      };
    } catch (connectError: any) {
      // Check if it's a connection error in local dev
      const isLocalDev = process.env.NODE_ENV !== 'production' && !process.env.FLY_APP_NAME;
      const isConnectionError = connectError?.code === 'ENOTFOUND' || 
                                connectError?.code === 'ECONNREFUSED' ||
                                connectError?.message === 'Connection timeout';
      
      if (isConnectionError && isLocalDev) {
        console.warn('[Redis] Cannot connect to Redis in local development');
        console.warn('[Redis] Redis adapter: disabled (in-memory)');
        console.warn('[Redis] This is expected if REDIS_URL points to a Fly.io instance');
      } else {
        console.error('[Redis] Failed to initialize Redis:', connectError);
      }
      
      // Clean up on error
      if (redisPubClient) {
        redisPubClient.disconnect();
        redisPubClient = null;
      }
      if (redisSubClient) {
        redisSubClient.disconnect();
        redisSubClient = null;
      }
      return null;
    }
  } catch (error) {
    console.error('[Redis] Failed to initialize Redis:', error);
    // Clean up on error
    if (redisPubClient) {
      redisPubClient.disconnect();
      redisPubClient = null;
    }
    if (redisSubClient) {
      redisSubClient.disconnect();
      redisSubClient = null;
    }
    return null;
  }
}

/**
 * Get Redis client instance (for direct Redis operations if needed)
 */
export function getRedisClient(): Redis | null {
  return redisClient;
}

/**
 * Check Redis connection health
 */
export async function checkRedisHealth(): Promise<boolean> {
  if (!redisPubClient || !redisSubClient) {
    return false;
  }

  try {
    // Check if clients are connected
    const pubStatus = redisPubClient.status;
    const subStatus = redisSubClient.status;

    if (pubStatus !== 'ready' || subStatus !== 'ready') {
      return false;
    }

    // Try a simple ping
    await redisPubClient.ping();
    return true;
  } catch (error) {
    console.error('[Redis] Health check failed:', error);
    return false;
  }
}

/**
 * Close Redis connections
 */
export async function closeRedis(): Promise<void> {
  const promises: Promise<void>[] = [];

  if (redisPubClient) {
    promises.push(redisPubClient.quit().then(() => {}).catch(() => {}) as Promise<void>);
    redisPubClient = null;
  }

  if (redisSubClient) {
    promises.push(redisSubClient.quit().then(() => {}).catch(() => {}) as Promise<void>);
    redisSubClient = null;
  }

  if (redisClient) {
    promises.push(redisClient.quit().then(() => {}).catch(() => {}) as Promise<void>);
    redisClient = null;
  }

  await Promise.all(promises);
  console.log('[Redis] All Redis connections closed');
}

