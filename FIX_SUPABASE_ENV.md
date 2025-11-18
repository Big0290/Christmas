# Fix: Supabase Client Not Initialized

## Problem
The Supabase client is not initializing because environment variables from `.env` are not being loaded properly in SvelteKit.

## Solution

### 1. Environment Variables Location
Your `.env` file should be in the project root with these variables:
```env
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 2. Changes Made

#### `apps/web/vite.config.ts`
- Added `dotenv` to load `.env` from project root
- Ensures Vite can access environment variables during build/dev

#### `apps/web/src/hooks.server.ts` (NEW)
- Created server hook to load `.env` from project root
- Logs environment variable status in dev mode

#### `apps/web/src/routes/config/+server.ts`
- Updated to load `.env` from project root
- Ensures runtime config endpoint has access to env vars

### 3. Restart Dev Server

**IMPORTANT:** After making these changes, you MUST restart your dev server:

```bash
# Stop the current dev server (Ctrl+C)
# Then restart:
pnpm dev:web
```

### 4. Verify Environment Variables

Check the browser console for these logs:
- `[Hooks] ✅ Loaded .env from: ...`
- `[Hooks] PUBLIC_SUPABASE_URL: ✅ Set`
- `[Hooks] PUBLIC_SUPABASE_ANON_KEY: ✅ Set`
- `[Auth] ✅ Supabase client initialized successfully`

### 5. Troubleshooting

If still not working:

1. **Check .env file location:**
   ```bash
   # Should be in project root
   ls -la .env
   ```

2. **Verify variables are set:**
   ```bash
   grep SUPABASE .env
   ```

3. **Check variable names:**
   - Must start with `PUBLIC_` for client-side access
   - No spaces around `=`
   - No quotes needed

4. **Clear build cache:**
   ```bash
   pnpm --filter web clean
   rm -rf apps/web/.svelte-kit
   pnpm dev:web
   ```

5. **Check browser console:**
   - Look for `[Auth] ⚠️ Supabase client not available`
   - Check Network tab for `/config` endpoint response

### 6. Alternative: Use Runtime Config Endpoint

If environment variables still don't load, the app will automatically fall back to fetching from `/config` endpoint, which reads from `process.env` on the server.

## Expected Behavior

After restarting:
1. Server loads `.env` from project root
2. Vite exposes `PUBLIC_*` vars to client via `import.meta.env`
3. Supabase client initializes successfully
4. No more "Supabase client not initialized" errors

