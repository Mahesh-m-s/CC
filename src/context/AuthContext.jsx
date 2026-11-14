import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../config/supabase.js';
import api from '../services/api.js';
import { normalizeIdentifier, OFFICIAL_STAFF_ACCOUNTS } from '../utils/authValidator.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('mcc_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [token, setToken] = useState(() => localStorage.getItem('mcc_token') || null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  /**
   * Helper: Fetches the verified user profile from Supabase PostgreSQL 'profiles' table.
   * Security requirement: Never trust client-supplied role or editable metadata.
   */
  const fetchVerifiedProfile = useCallback(async (userId, fallbackUser = null) => {
    if (!isSupabaseConfigured() || !supabase) {
      return null;
    }

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, role, ward_id, created_at')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.warn('[AuthContext] Profile fetch warning:', error.message);
      }

      if (profile) {
        return {
          id: profile.id,
          email: profile.email || fallbackUser?.email,
          name: profile.full_name || fallbackUser?.name || 'Mysuru Citizen',
          role: profile.role || 'citizen',
          ward_id: profile.ward_id || null,
          phone: profile.phone || fallbackUser?.phone || '',
          badge: profile.role === 'admin' 
            ? 'Admin' 
            : (profile.role === 'field_officer' 
              ? 'Officer' 
              : (profile.role === 'corporator' ? 'Corporator' : 'Citizen')),
          created_at: profile.created_at
        };
      }
    } catch (err) {
      console.warn('[AuthContext] Error fetching profile:', err);
    }

    return null;
  }, []);

  /**
   * Initialize Session & Setup Supabase Auth Listeners
   */
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      // 1. If Supabase is configured, use real cloud authentication
      if (isSupabaseConfigured() && supabase) {
        try {
          const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
          if (sessionErr) throw sessionErr;

          const currentSession = sessionData?.session;
          if (currentSession && mounted) {
            setSession(currentSession);
            setToken(currentSession.access_token);
            localStorage.setItem('mcc_token', currentSession.access_token);

            const verifiedProfile = await fetchVerifiedProfile(currentSession.user.id, currentSession.user);
            const resolvedUser = verifiedProfile || {
              id: currentSession.user.id,
              email: currentSession.user.email,
              name: currentSession.user.user_metadata?.full_name || currentSession.user.email?.split('@')[0],
              role: 'citizen',
              badge: 'Citizen'
            };

            setUser(resolvedUser);
            localStorage.setItem('mcc_user', JSON.stringify(resolvedUser));
          } else if (mounted && !currentSession) {
            // No active Supabase session
            setSession(null);
            setToken(null);
            setUser(null);
            localStorage.removeItem('mcc_token');
            localStorage.removeItem('mcc_user');
          }
        } catch (err) {
          console.error('[AuthContext] Supabase session initialization error:', err);
        } finally {
          if (mounted) setLoading(false);
        }

        // Setup real-time auth state listener
        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
          if (!mounted) return;

          if (event === 'SIGNED_OUT' || !newSession) {
            setSession(null);
            setToken(null);
            setUser(null);
            localStorage.removeItem('mcc_token');
            localStorage.removeItem('mcc_user');
          } else if (newSession) {
            setSession(newSession);
            setToken(newSession.access_token);
            localStorage.setItem('mcc_token', newSession.access_token);

            const verifiedProfile = await fetchVerifiedProfile(newSession.user.id, newSession.user);
            const resolvedUser = verifiedProfile || {
              id: newSession.user.id,
              email: newSession.user.email,
              name: newSession.user.user_metadata?.full_name || newSession.user.email?.split('@')[0],
              role: 'citizen',
              badge: 'Citizen'
            };

            setUser(resolvedUser);
            localStorage.setItem('mcc_user', JSON.stringify(resolvedUser));
          }
        });

        return () => {
          mounted = false;
          authListener?.subscription?.unsubscribe();
        };
      }

      // 2. Demo fallback if Supabase environment variables are not yet populated
      const savedToken = localStorage.getItem('mcc_token');
      if (savedToken && mounted) {
        try {
          const res = await api.get('/auth/me');
          if (mounted && res.data?.user) {
            setUser(res.data.user);
            localStorage.setItem('mcc_user', JSON.stringify(res.data.user));
          }
        } catch (err) {
          if (mounted) logout();
        }
      }
      if (mounted) setLoading(false);

      return () => {
        mounted = false;
      };
    }

    initAuth();
  }, [fetchVerifiedProfile]);

  /**
   * Login using Supabase Auth signInWithPassword()
   */
  const login = async (identifier, password) => {
    const normalizedEmail = normalizeIdentifier(identifier);

    // Path A: Real Supabase Cloud Authentication
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: password
        });

        if (error) {
          // If Supabase returned an error, check if this is an official staff account
          // that hasn't been manually created in the Supabase Auth dashboard yet.
          const isStaff = OFFICIAL_STAFF_ACCOUNTS.some(
            a => a.email.toLowerCase() === normalizedEmail.toLowerCase() || a.aliases.includes(identifier.trim().toLowerCase())
          );

          if (isStaff) {
            console.warn('[AuthContext] Staff account not in Supabase Auth, activating pre-seeded staff session.');
            const res = await api.post('/auth/login', { email: identifier, password });
            const { token: newToken, user: userData } = res.data;
            localStorage.setItem('mcc_token', newToken);
            localStorage.setItem('mcc_user', JSON.stringify(userData));
            setToken(newToken);
            setUser(userData);
            return userData;
          }

          console.error('[AuthContext] Supabase sign in error:', error.message);
          throw new Error(error.message || 'Authentication failed. Please verify your email and password.');
        }

        const activeSession = data.session;
        const authUser = data.user;

        setSession(activeSession);
        setToken(activeSession.access_token);
        localStorage.setItem('mcc_token', activeSession.access_token);

        // Retrieve verified role and profile from PostgreSQL
        const verifiedProfile = await fetchVerifiedProfile(authUser.id, authUser);
        const resolvedUser = verifiedProfile || {
          id: authUser.id,
          email: authUser.email,
          name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0],
          role: 'citizen',
          badge: 'Citizen'
        };

        setUser(resolvedUser);
        localStorage.setItem('mcc_user', JSON.stringify(resolvedUser));
        return resolvedUser;
      } catch (err) {
        // Fallback for official staff demo credentials so demonstration is never blocked
        const isStaff = OFFICIAL_STAFF_ACCOUNTS.some(
          a => a.email.toLowerCase() === normalizedEmail.toLowerCase() || a.aliases.includes(identifier.trim().toLowerCase())
        );
        if (isStaff) {
          console.warn('[AuthContext] Fallback to pre-seeded staff authentication:', err.message);
          const res = await api.post('/auth/login', { email: identifier, password });
          const { token: newToken, user: userData } = res.data;
          localStorage.setItem('mcc_token', newToken);
          localStorage.setItem('mcc_user', JSON.stringify(userData));
          setToken(newToken);
          setUser(userData);
          return userData;
        }
        throw err;
      }
    }

    // Path B: Demo / Offline fallback adapter
    const res = await api.post('/auth/login', { email: identifier, password });
    const { token: newToken, user: userData } = res.data;
    localStorage.setItem('mcc_token', newToken);
    localStorage.setItem('mcc_user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    return userData;
  };

  /**
   * Citizen Registration using Supabase Auth signUp()
   * Enforces: Public registrations MUST strictly create a 'citizen' role.
   */
  const register = async (registerData) => {
    const { name, email, phone, password, ward_id, ward_name } = registerData;

    // Path A: Real Supabase Cloud Authentication
    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: password,
        options: {
          data: {
            full_name: name.trim(),
            phone: phone ? phone.trim().replace(/\D/g, '') : '',
            ward_id: ward_id ? parseInt(ward_id, 10) : null,
            ward_name: ward_name || '',
            role: 'citizen' // Public signup strictly restricted to citizen
          }
        }
      });

      if (error) {
        console.error('[AuthContext] Supabase sign up error:', error.message);
        throw new Error(error.message || 'Registration failed. Please check your information and try again.');
      }

      // Check if session was automatically issued (no email confirmation requirement)
      if (data.session) {
        const activeSession = data.session;
        setSession(activeSession);
        setToken(activeSession.access_token);
        localStorage.setItem('mcc_token', activeSession.access_token);

        const verifiedProfile = await fetchVerifiedProfile(data.user.id, data.user);
        const resolvedUser = verifiedProfile || {
          id: data.user.id,
          email: data.user.email,
          name: name.trim(),
          phone: phone || '',
          ward_id: ward_id || null,
          role: 'citizen',
          badge: 'Citizen'
        };

        setUser(resolvedUser);
        localStorage.setItem('mcc_user', JSON.stringify(resolvedUser));
        return resolvedUser;
      }

      // If email confirmation is required by Supabase project settings
      const pendingUser = {
        id: data.user?.id || 'pending',
        email: email.trim().toLowerCase(),
        name: name.trim(),
        role: 'citizen',
        badge: 'Citizen',
        emailConfirmationPending: true
      };
      return pendingUser;
    }

    // Path B: Demo / Offline fallback adapter
    const res = await api.post('/auth/register', registerData);
    const { token: newToken, user: userData } = res.data;
    localStorage.setItem('mcc_token', newToken);
    localStorage.setItem('mcc_user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    return userData;
  };

  /**
   * Sign out of Supabase Auth and clear local state
   */
  const logout = async () => {
    try {
      if (isSupabaseConfigured() && supabase) {
        await supabase.auth.signOut();
      } else {
        await api.post('/auth/logout');
      }
    } catch (e) {
      console.warn('[AuthContext] Logout warning:', e.message);
    } finally {
      localStorage.removeItem('mcc_token');
      localStorage.removeItem('mcc_user');
      setSession(null);
      setToken(null);
      setUser(null);
    }
  };

  const value = {
    user,
    token,
    session,
    loading,
    login,
    register,
    logout,
    isAdmin: user?.role === 'admin',
    isOfficer: user?.role === 'field_officer',
    isCorporator: user?.role === 'corporator',
    isCitizen: user ? (user.role === 'citizen' || (!['admin', 'field_officer', 'corporator'].includes(user.role))) : false,
    isCloudAuth: isSupabaseConfigured()
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
