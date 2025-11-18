# 🏠 Local Supabase Development Setup

This guide will help you set up Supabase locally so you can develop and test without deploying.

## Prerequisites

1. **Docker Desktop** - Supabase CLI requires Docker to run local services
   - Download from: https://www.docker.com/products/docker-desktop
   - Make sure Docker is running before starting Supabase

2. **Supabase CLI** - Install globally:
   ```bash
   npm install -g supabase
   # or
   brew install supabase/tap/supabase
   ```

## Quick Start

### 1. Initialize Supabase (First Time Only)

```bash
# This creates the config.toml file (already done for this project)
pnpm supabase:init
```

### 2. Start Local Supabase

```bash
# Start all Supabase services (Postgres, Auth, Storage, etc.)
pnpm supabase:start
```

This will:
- Download Docker images (first time only, ~500MB)
- Start all Supabase services
- Run all migrations automatically
- Display connection details

**Expected output:**
```
Started supabase local development setup.

         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
    Inbucket URL: http://127.0.0.1:54324
      JWT secret: super-secret-jwt-token-with-at-least-32-characters-long
        anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Copy Connection Details to .env

Copy the values from the output above to your `.env` file:

```bash
# Create .env from example
cp .env.example .env
```

Then update `.env` with the values from `pnpm supabase:status`:

```env
PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
PUBLIC_SUPABASE_ANON_KEY=<copy from supabase:status output>
SUPABASE_SERVICE_ROLE_KEY=<copy from supabase:status output>
```

**Note:** The default keys in `.env.example` should work, but it's better to use the actual keys from your local instance.

### 4. Start Your Application

```bash
# Start both web and server (Supabase will auto-start if not running)
pnpm dev:local

# Or start them separately:
pnpm dev:web      # Terminal 1
pnpm dev:server   # Terminal 2
```

## Useful Commands

### Check Supabase Status
```bash
pnpm supabase:status
```
Shows all connection details and service statuses.

### Reset Database
```bash
# Reset database and re-run all migrations
pnpm supabase:reset
```
Useful when you want to start fresh with clean data.

### Stop Supabase
```bash
pnpm supabase:stop
```
Stops all Supabase services (Docker containers).

### View Logs
```bash
# View all logs
supabase logs

# View specific service logs
supabase logs --db
supabase logs --api
supabase logs --auth
```

## Accessing Local Services

- **Supabase Studio**: http://127.0.0.1:54323
  - Database browser, SQL editor, table editor
  - Auth users management
  - Storage browser

- **Inbucket (Email Testing)**: http://127.0.0.1:54324
  - View all emails sent by Supabase Auth
  - Useful for testing email confirmations, password resets, etc.

- **API**: http://127.0.0.1:54321
  - REST API endpoint
  - Same as production Supabase API

## Database Migrations

All migrations are in `supabase/migrations/`. When you start Supabase, they run automatically.

To create a new migration:
```bash
supabase migration new migration_name
```

To apply migrations manually:
```bash
supabase db reset
```

## Troubleshooting

### Docker Not Running
```
Error: Docker is not running
```
**Solution:** Start Docker Desktop and wait for it to fully start.

### Port Already in Use
```
Error: port 54321 is already in use
```
**Solution:** 
1. Check if Supabase is already running: `pnpm supabase:status`
2. Stop any conflicting services on those ports
3. Or stop Supabase: `pnpm supabase:stop` then restart

### Migration Errors
```
Error: migration failed
```
**Solution:**
1. Check migration files for syntax errors
2. Reset database: `pnpm supabase:reset`
3. Check logs: `supabase logs --db`

### Can't Connect to Database
```
Error: connection refused
```
**Solution:**
1. Make sure Supabase is running: `pnpm supabase:status`
2. Check Docker containers: `docker ps`
3. Restart Supabase: `pnpm supabase:stop && pnpm supabase:start`

### Environment Variables Not Loading
**Solution:**
1. Make sure `.env` file exists in project root
2. Restart your dev servers after changing `.env`
3. Check that variables are prefixed with `PUBLIC_` for client-side access

## Development Workflow

1. **Start Supabase**: `pnpm supabase:start`
2. **Start App**: `pnpm dev:local` (or separate terminals)
3. **Make Changes**: Edit code, migrations, etc.
4. **Test Locally**: Use Studio to inspect database
5. **Reset if Needed**: `pnpm supabase:reset` to start fresh

## Production vs Local

When deploying to production:
1. Use production Supabase project credentials
2. Update `.env` with production values
3. Migrations run automatically on production via Supabase dashboard

## Next Steps

- Read the [Supabase Local Development Docs](https://supabase.com/docs/guides/cli/local-development)
- Explore Supabase Studio at http://127.0.0.1:54323
- Check email testing in Inbucket at http://127.0.0.1:54324

