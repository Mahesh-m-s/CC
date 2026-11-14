import { supabase, isSupabaseConfigured } from '../config/supabase.js';

/**
 * Supabase Authentication & Profile Verification Middleware.
 * Strictly verifies the Bearer JWT token against Supabase Auth (via getUser)
 * and loads the user's role and profile from the database.
 */
export async function requireAuth(req, res, next) {
  try {
    const authHeader = (req.headers.authorization || '').trim();

    if (!authHeader || (!authHeader.startsWith('Bearer ') && authHeader !== 'Bearer')) {
      return res.status(401).json({
        error: 'Unauthorized: Missing or malformed Authorization header. Expected Bearer token.'
      });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized: Bearer token is empty.'
      });
    }

    // Check if Supabase connection is configured
    if (!isSupabaseConfigured() || !supabase) {
      // In development/test if mock auth header is passed explicitly
      if (process.env.NODE_ENV === 'test' && req.headers['x-test-mock-user']) {
        try {
          req.user = JSON.parse(req.headers['x-test-mock-user']);
          req.token = token;
          return next();
        } catch (e) {
          // ignore
        }
      }
      return res.status(503).json({
        error: 'Supabase configuration missing on backend. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in backend/.env.'
      });
    }

    // 1. Verify token with Supabase Auth (calls Supabase Auth API, never just decodes)
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData?.user) {
      return res.status(401).json({
        error: 'Unauthorized: Invalid, expired, or revoked authentication token.',
        details: authError?.message || 'Token verification failed'
      });
    }

    const authUser = authData.user;

    // 2. Fetch authenticated user's profile and verified role from PostgreSQL
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, role, ward_id')
      .eq('id', authUser.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      console.warn(`[AuthMiddleware] Profile lookup warning for user ${authUser.id}:`, profileError.message);
    }

    // 3. Attach verified user identity to request object
    req.user = {
      id: authUser.id,
      email: authUser.email,
      name: profile?.full_name || authUser.user_metadata?.full_name || authUser.email.split('@')[0],
      role: profile?.role || 'citizen',
      ward_id: profile?.ward_id || null,
      phone: profile?.phone || authUser.user_metadata?.phone || null,
      profile: profile || null
    };

    req.token = token;
    next();
  } catch (err) {
    console.error('[AuthMiddleware] Unexpected authentication error:', err);
    return res.status(500).json({
      error: 'Internal authentication verification error.',
      message: err.message
    });
  }
}
