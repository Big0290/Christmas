import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;
let supabaseAnonClient: SupabaseClient | null = null;

export function createSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️  Supabase credentials not found - running without database (games will use defaults)');
    return null;
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey);
  return supabaseClient;
}

export function createSupabaseAnonClient(): SupabaseClient | null {
  if (supabaseAnonClient) {
    return supabaseAnonClient;
  }

  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('⚠️  Supabase anon key not found - auth verification disabled');
    console.warn('⚠️  PUBLIC_SUPABASE_URL:', supabaseUrl ? 'found' : 'missing');
    console.warn('⚠️  PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'found' : 'missing');
    return null;
  }

  console.log('[Auth] Initializing Supabase anon client with URL:', supabaseUrl);
  supabaseAnonClient = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseAnonClient;
}

export async function verifyAuthToken(token: string): Promise<{ userId: string; email: string } | null> {
  console.log('[Auth] verifyAuthToken called with token length:', token?.length || 0);
  
  const supabase = createSupabaseAnonClient();
  if (!supabase) {
    console.error('[Auth] ❌ Supabase anon client not initialized - cannot verify token');
    console.error('[Auth] Check that PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY are set in .env');
    return null;
  }

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    console.error('[Auth] ❌ Invalid token format - token is:', token ? `"${token.substring(0, 50)}..."` : 'null/undefined');
    return null;
  }

  try {
    console.log('[Auth] ✅ Calling supabase.auth.getUser() with token (first 50 chars):', token.substring(0, 50) + '...');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error) {
      console.error('[Auth] ❌ Supabase error verifying token:');
      console.error('[Auth]   Message:', error.message);
      console.error('[Auth]   Status:', error.status);
      console.error('[Auth]   Name:', error.name);
      console.error('[Auth]   Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      return null;
    }

    if (!user) {
      console.error('[Auth] No user returned from token verification (no error, but user is null)');
      return null;
    }

    console.log('[Auth] Token verified successfully:', {
      userId: user.id,
      email: user.email,
      emailConfirmed: !!user.email_confirmed_at,
      createdAt: user.created_at,
    });

    // Check if email is confirmed (if email confirmation is required)
    // Note: This might fail for newly signed up users if email confirmation is required
    if (user.email && !user.email_confirmed_at) {
      console.warn('[Auth] User email not confirmed yet:', user.email);
      // Still allow them to proceed - email confirmation can happen later
      // Uncomment the line below if you want to require email confirmation:
      // return null;
    }

    return {
      userId: user.id,
      email: user.email || '',
    };
  } catch (error: any) {
    console.error('[Auth] Exception verifying token:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      fullError: error,
    });
    return null;
  }
}
