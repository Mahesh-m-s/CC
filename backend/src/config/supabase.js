import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

export const SUPABASE_URL = process.env.SUPABASE_URL || '';
export const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

export function isSupabaseConfigured() {
  return Boolean(
    SUPABASE_URL && 
    SUPABASE_KEY && 
    !SUPABASE_URL.includes('your-project')
  );
}

// Master Supabase client for backend operations
export const supabase = isSupabaseConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : null;

/**
 * Creates an authenticated Supabase client using the caller's JWT token
 * ensuring Row Level Security (RLS) is naturally respected.
 */
export function getAuthenticatedSupabaseClient(bearerToken) {
  if (!isSupabaseConfigured()) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${bearerToken}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

