import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

type SignUpMetadata = {
  full_name: string;
  username: string;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    metadata: SignUpMetadata,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    /*
     * Supabase automatically refreshes the access token while the app is
     * active. When the app goes into the background we stop the refresh timer
     * and restart it when the app becomes active again.
     */
    const handleAppStateChange = (state: string) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    };

    const appStateSubscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    if (AppState.currentState === 'active') {
      supabase.auth.startAutoRefresh();
    }

    /*
     * Subscribe before loading the persisted session so an auth event cannot
     * be missed during startup.
     */
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;

      setSession(nextSession);
      setLoading(false);
    });

    const loadStoredSession = async () => {
      try {
        const {
          data: { session: storedSession },
          error,
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          console.error('AUTH SESSION LOAD ERROR:', error);
          setSession(null);
        } else {
          setSession(storedSession);
        }
      } catch (error) {
        if (mounted) {
          console.error('AUTH SESSION LOAD EXCEPTION:', error);
          setSession(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadStoredSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
      appStateSubscription.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    return {
      error: error?.message ?? null,
    };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, metadata: SignUpMetadata) => {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: metadata.full_name,
            username: metadata.username,
          },
        },
      });

      return {
        error: error?.message ?? null,
      };
    },
    [],
  );

  const signOut = useCallback(async () => {
    /*
     * Supabase's default sign-out scope is local. This clears the session on
     * this device without signing the user out of other devices.
     */
    const { error } = await supabase.auth.signOut({
      scope: 'local',
    });

    return {
      error: error?.message ?? null,
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      signIn,
      signUp,
      signOut,
    }),
    [session, loading, signIn, signUp, signOut],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
