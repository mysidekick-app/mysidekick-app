import {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type {
  Session,
  User,
} from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

type SignUpMetadata = {
  full_name: string;
  username: string;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;

  signIn: (
    email: string,
    password: string
  ) => Promise<{
    error: string | null;
  }>;

  signUp: (
    email: string,
    password: string,
    metadata: SignUpMetadata
  ) => Promise<{
    error: string | null;
  }>;

  signOut: () => Promise<{
    error: string | null;
  }>;
};

const AuthContext =
  createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
}: PropsWithChildren) {
  const [session, setSession] =
    useState<Session | null>(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const {
        data,
        error,
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (!error) {
        setSession(data.session);
      }

      setLoading(false);
    }

    loadSession();

    const {
      data: {
        subscription,
      },
    } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!mounted) {
          return;
        }

        setSession(newSession);
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (
    email: string,
    password: string
  ) => {
    const { error } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

    return {
      error: error?.message ?? null,
    };
  };

  const signUp = async (
    email: string,
    password: string,
    metadata: SignUpMetadata
  ) => {
    const { error } =
      await supabase.auth.signUp({
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
  };

  const signOut = async () => {
    const { error } =
      await supabase.auth.signOut();

    return {
      error: error?.message ?? null,
    };
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      signIn,
      signUp,
      signOut,
    }),
    [session, loading]
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
    throw new Error(
      'useAuth must be used inside AuthProvider'
    );
  }

  return context;
}
