import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import type { Profile } from '../lib/database.types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  changePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  // The user id `profile` was loaded for. Supabase hands out a fresh session
  // object on every token refresh, re-sign-in, or user update, and only a
  // change of user should send every screen back through Loading….
  const [profileFor, setProfileFor] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(err => console.error('Failed to read the stored session:', err))
      .finally(() => setSessionReady(true));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!userId) {
        setProfile(null);
        setProfileFor(null);
        return;
      }
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();

      if (cancelled) return;
      if (error) {
        // A logged-in auth user with no matching profiles row shouldn't happen
        // in normal use (profiles are provisioned together — see
        // docs/screens-and-flows.md section 4) but fail safe rather than
        // crash the app.
        console.error('Failed to load profile for logged-in user:', error);
        setProfile(null);
      } else {
        setProfile(data as Profile);
      }
      setProfileFor(userId);
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Stay loading until the stored session has been read back and, if someone
  // is signed in, until their profile (and so their role) is known. Holding
  // through that first read is what lets a typed URL survive a page load
  // instead of bouncing through /login.
  const loading = !sessionReady || (userId !== null && profileFor !== userId);

  async function signInWithPassword(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  // Signs in again with the current password before updating. That confirms
  // the person at the keyboard knows it, and it means the update runs on a
  // session created seconds earlier, which is what Supabase's optional
  // "Secure password change" setting asks for. The emailed one-time-code
  // route can't work here because the synthetic addresses receive nothing.
  async function changePassword(currentPassword: string, newPassword: string) {
    const email = session?.user.email;
    if (!email) return { error: 'You are not signed in.' };

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword
    });
    if (signInError) {
      return {
        error:
          signInError.code === 'invalid_credentials'
            ? 'The current password is incorrect.'
            : signInError.message
      };
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const value: AuthState = {
    session,
    profile,
    loading,
    isAdmin: profile?.role === 'admin',
    signInWithPassword,
    changePassword,
    signOut
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
