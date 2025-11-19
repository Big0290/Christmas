import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient, User, Session } from '@supabase/supabase-js';
import { browser } from '$app/environment';
import { writable } from 'svelte/store';

// SvelteKit exposes PUBLIC_ prefixed env vars via import.meta.env
// For Fly.io/Docker, we also fetch from a runtime config endpoint as fallback
let supabaseUrl: string | undefined;
let supabaseAnonKey: string | undefined;
let configLoadPromise: Promise<void> | null = null;

// Initialize config - try import.meta.env first, then fetch from runtime endpoint
function loadConfig(): Promise<void> {
  if (configLoadPromise) return configLoadPromise;
  
  configLoadPromise = (async () => {
    if (!browser) return;
    
    // Try to get from import.meta.env first (available at build time)
    supabaseUrl = (import.meta.env.PUBLIC_SUPABASE_URL || 
                   import.meta.env.VITE_PUBLIC_SUPABASE_URL || '').trim() || undefined;
    supabaseAnonKey = (import.meta.env.PUBLIC_SUPABASE_ANON_KEY || 
                       import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '').trim() || undefined;
    
    // If not found, fetch from runtime config endpoint (for Fly.io/Docker)
    if (!supabaseUrl || !supabaseAnonKey) {
      try {
        const response = await fetch('/config');
        if (response.ok) {
          const config = await response.json();
          if (config.PUBLIC_SUPABASE_URL) supabaseUrl = config.PUBLIC_SUPABASE_URL;
          if (config.PUBLIC_SUPABASE_ANON_KEY) supabaseAnonKey = config.PUBLIC_SUPABASE_ANON_KEY;
          console.log('[Auth] ✅ Loaded config from runtime endpoint');
        }
      } catch (e) {
        console.warn('[Auth] Could not fetch runtime config:', e);
      }
    }
  })();
  
  return configLoadPromise;
}

// Start loading config immediately if in browser
if (browser) {
  loadConfig();
}

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!browser) return null;
  
  // Try to get from import.meta.env synchronously first
  const url = supabaseUrl || (import.meta.env.PUBLIC_SUPABASE_URL || '').trim() || undefined;
  const key = supabaseAnonKey || (import.meta.env.PUBLIC_SUPABASE_ANON_KEY || '').trim() || undefined;
  
  if (!url || !key) {
    // Trigger async load if not already loading
    if (!configLoadPromise) {
      loadConfig();
    }
    return null;
  }

  // Update module-level variables for future calls
  const urlChanged = supabaseUrl && supabaseUrl !== url;
  const keyChanged = supabaseAnonKey && supabaseAnonKey !== key;
  
  if (!supabaseUrl) supabaseUrl = url;
  if (!supabaseAnonKey) supabaseAnonKey = key;
  
  // If client exists and credentials match, return it
  // If credentials changed, recreate the client
  if (supabaseClient && !urlChanged && !keyChanged) {
    return supabaseClient;
  }
  
  // Credentials changed or client doesn't exist - recreate it
  if (urlChanged || keyChanged) {
    console.log('[Auth] Credentials changed, recreating Supabase client');
    supabaseClient = null;
  }

  // Create new client with proper session persistence
  // Use a consistent storage key that works across environments
  const storageKey = `sb-${url.replace(/https?:\/\//, '').replace(/\./g, '-')}-auth-token`;
  console.log('[Auth] Creating Supabase client with session persistence', {
    url: url.substring(0, 30) + '...',
    storageKey,
  });
  
  supabaseClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: browser ? window.localStorage : undefined,
      // Don't override storageKey - let Supabase use its default based on URL
      // This ensures sessions persist correctly
    },
  });

  return supabaseClient;
}

// Auth store
export const authUser = writable<User | null>(null);
export const authSession = writable<Session | null>(null);
export const authLoading = writable<boolean>(true);

// Initialize auth state
export async function initializeAuth() {
  if (!browser) {
    authLoading.set(false);
    return;
  }

  // Wait for config to load if it's still loading
  if (configLoadPromise) {
    console.log('[Auth] Waiting for config to load...');
    await configLoadPromise;
    console.log('[Auth] Config loaded, creating client...');
  }

  // Try to get client - if still null, wait a bit and retry (config might be loading)
  let supabase = getSupabaseClient();
  if (!supabase) {
    console.log('[Auth] Client not ready, waiting for config...');
    // Wait a moment for config to load from runtime endpoint
    await new Promise(resolve => setTimeout(resolve, 1000));
    supabase = getSupabaseClient();
  }

  if (!supabase) {
    console.warn('[Auth] ⚠️  Supabase client not available after waiting for config');
    console.warn('[Auth] This usually means PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY are not set');
    authLoading.set(false);
    return;
  }
  
  console.log('[Auth] ✅ Supabase client initialized successfully');

  // Handle email confirmation callback from URL
  // Supabase redirects back with tokens in the URL hash
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');
  
  if (accessToken && refreshToken) {
    console.log('[Auth] Email confirmation detected in URL, setting session...');
    const { data: { session }, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    
    if (error) {
      console.error('[Auth] Error setting session from URL:', error);
    } else if (session) {
      console.log('[Auth] Session set successfully from email confirmation');
      // Clean up URL hash
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  // Get initial session
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error) {
    console.error('[Auth] Error getting session:', error);
    authLoading.set(false);
    return;
  }

  if (session) {
    console.log('[Auth] ✅ Session found:', {
      userId: session.user.id,
      email: session.user.email,
      expiresAt: new Date(session.expires_at! * 1000).toISOString(),
      accessToken: session.access_token ? `${session.access_token.substring(0, 20)}...` : 'missing',
    });
  } else {
    console.log('[Auth] ⚠️  No session found - checking localStorage...');
    // Check localStorage directly for debugging
    if (browser) {
      const stored = localStorage.getItem('sb-auth-token');
      console.log('[Auth] localStorage check:', stored ? 'found token' : 'no token');
      // Also check for default Supabase storage key
      const defaultStored = localStorage.getItem(`sb-${supabaseUrl?.split('//')[1]?.split('.')[0]}-auth-token`);
      console.log('[Auth] Default storage key check:', defaultStored ? 'found' : 'not found');
    }
  }

  authSession.set(session);
  authUser.set(session?.user ?? null);
  authLoading.set(false);

  // Listen for auth changes
  supabase.auth.onAuthStateChange((event, session) => {
    console.log('[Auth] 🔄 State changed:', event, session ? {
      userId: session.user.id,
      email: session.user.email,
    } : 'no session');
    authSession.set(session);
    authUser.set(session?.user ?? null);
    authLoading.set(false);
  });
}

// Auth functions
export async function signUp(email: string, password: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[Auth] Error getting session:', error);
    return null;
  }

  return session;
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  const token = session?.access_token ?? null;
  
  if (!token) {
    console.warn('[Auth] No access token available - user may need to sign in');
  } else {
    console.log('[Auth] Access token retrieved:', token.substring(0, 20) + '...');
  }
  
  return token;
}

/**
 * Create an anonymous Supabase client for server-side API routes
 * This is used for public endpoints that don't require authentication
 * @param platformEnv Optional environment variables from SvelteKit platform (for Fly.io)
 */
export function createSupabaseAnonClient(platformEnv?: Record<string, string | undefined>): SupabaseClient | null {
  // Get URL and key - try platform.env (Fly.io), then import.meta.env, then process.env
  const env = platformEnv || (typeof process !== 'undefined' ? process.env : {});
  
  const url = 
    (platformEnv?.PUBLIC_SUPABASE_URL) ||
    (typeof import.meta !== 'undefined' && (import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.VITE_PUBLIC_SUPABASE_URL)) ||
    (env.PUBLIC_SUPABASE_URL) ||
    '';
  const key = 
    (platformEnv?.PUBLIC_SUPABASE_ANON_KEY) ||
    (typeof import.meta !== 'undefined' && (import.meta.env.PUBLIC_SUPABASE_ANON_KEY || import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY)) ||
    (env.PUBLIC_SUPABASE_ANON_KEY) ||
    '';
  
  const finalUrl = url.trim() || undefined;
  const finalKey = key.trim() || undefined;
  
  if (!finalUrl || !finalKey) {
    console.error('[Supabase] Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY', {
      hasPlatformEnv: !!platformEnv,
      hasImportMeta: typeof import.meta !== 'undefined',
      hasProcess: typeof process !== 'undefined',
      urlFromPlatform: platformEnv?.PUBLIC_SUPABASE_URL,
      urlFromImportMeta: typeof import.meta !== 'undefined' ? import.meta.env.PUBLIC_SUPABASE_URL : undefined,
      urlFromProcess: env.PUBLIC_SUPABASE_URL,
    });
    return null;
  }
  
  return createClient(finalUrl, finalKey, {
    auth: {
      persistSession: false, // Server-side doesn't need session persistence
      autoRefreshToken: false,
    },
  });
}

