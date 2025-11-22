# Redis Pub/Sub Setup Guide

## Quick Setup (Automated)

Run the setup script:

```bash
./scripts/setup-fly-redis.sh
```

## Manual Setup

If the automated script doesn't work, follow these steps:

### 1. Create Redis Instance

```bash
fly redis create <app-name>-redis --region sjc
```

**Note:** Fly.io will prompt you for:
- Database name (leave blank for auto-generated)
- Eviction policy (Yes recommended for caching)
- Replica regions (optional, can skip for now)

### 2. Get Redis Connection URL

After creation, get the connection URL:

```bash
fly redis status <redis-instance-name>
```

Look for a line like:
```
Apps can connect to Redis at redis://default:password@host:port
```

**Important:** For Upstash Redis, convert `redis://` to `rediss://` (with SSL):
- `redis://default:...@...` → `rediss://default:...@...`

### 3. Set Redis URL Secret

```bash
fly secrets set REDIS_URL="rediss://default:password@host:port" --app <app-name>
```

### 4. Verify Setup

Check that the secret is set:

```bash
fly secrets list --app <app-name>
```

### 5. Deploy and Scale

```bash
# Deploy your app
fly deploy

# Scale to multiple instances (requires Redis)
fly scale count 2

# Verify Redis connection
fly ssh console -C 'curl http://localhost:3000/health'
# Should show: "redis": "connected"
```

## Troubleshooting

### App Name Parsing Issue

If the script can't parse the app name from `fly.toml`:

1. Check your `fly.toml`:
   ```toml
   app = 'your-app-name'
   ```

2. Run the script and manually enter the app name when prompted

### Redis URL Not Found

If the script can't extract the Redis URL:

1. Run: `fly redis status <redis-instance-name>`
2. Look for the connection string in the output
3. Manually enter it when the script prompts you
4. Make sure to convert `redis://` to `rediss://` for Upstash Redis

### Redis Instance Name Mismatch

If Fly.io created Redis with a different name:

1. List all Redis instances: `fly redis list`
2. Use the actual instance name when prompted
3. Or create a new one with the expected name

### Testing Redis Connection

Test Redis connection locally:

```bash
# Set REDIS_URL in your .env file
REDIS_URL=rediss://default:password@host:port

# Start server
pnpm dev:server

# Check logs for: "[Socket.IO] Redis adapter configured"
```

## Example: Complete Manual Setup

```bash
# 1. Create Redis
fly redis create christmas-party-games-redis --region sjc
# (Answer prompts: Yes to eviction, skip replicas)

# 2. Get status and URL
fly redis status christmas-party-games-redis
# Copy the redis:// URL from output

# 3. Convert to rediss:// (add 's' after redis)
# redis://default:abc123@fly-xxx.upstash.io:6379
# becomes: rediss://default:abc123@fly-xxx.upstash.io:6379

# 4. Set secret
fly secrets set REDIS_URL="rediss://default:abc123@fly-xxx.upstash.io:6379" --app christmas-party-games

# 5. Deploy
fly deploy

# 6. Scale
fly scale count 2

# 7. Verify
fly ssh console -C 'curl http://localhost:3000/health'
```

## Health Check

The `/health` endpoint reports Redis status:

```bash
curl https://your-app.fly.dev/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": 1234567890,
  "redis": "connected",
  "adapter": "redis"
}
```

## Removing Redis

If you need to remove Redis:

```bash
# Remove secret
fly secrets unset REDIS_URL --app <app-name>

# Destroy Redis instance
fly redis destroy <redis-instance-name>

# Scale back to single instance
fly scale count 1
```

## Notes

- **Local Development**: Redis is optional. The server automatically uses in-memory adapter if `REDIS_URL` is not set.
- **Production**: Redis is required for horizontal scaling (multiple instances).
- **TLS**: Upstash Redis requires `rediss://` (with SSL) for production use.
- **Cost**: Upstash Redis is billed per command ($0.20 per 100K commands). Socket.IO adapter is efficient and shouldn't generate excessive commands.

