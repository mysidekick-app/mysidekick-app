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
import { configureRevenueCat } from '@/lib/revenuecat';

type SignUpMetadata = {
  full_name: string;
  username: string;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;

  /**
   * True only while an actual auth action is taking place.
   */
  loading: boolean;

  /**
   * True only while checking for an existing persisted session.
   *
   * This should NOT be used to show the login loading screen.
   */
  initializing: boolean;

  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;

  signUp: (
    email: string,
    password: string,
    metadata: SignUpMetadata,
  ) => Promise<{ error: string | null }>;

  resendConfirmationEmail: (
    email: string,
  ) => Promise<{ error: string | null }>;

  sendPasswordReset: (
    email: string,
  ) => Promise<{ error: string | null }>;

  updatePassword: (
    password: string,
  ) => Promise<{ error: string | null }>;

  signOut: () => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);

  // Loading for an actual login/signup/logout action.
  const [loading, setLoading] = useState(false);

  // Separate startup session restoration from normal auth actions.
  const [initializing, setInitializing] = useState(true);

  /**
   * Supabase authentication
   */
  useEffect(() => {
    let mounted = true;

    /**
     * IMPORTANT:
     *
     * During startup, Supabase can emit INITIAL_SESSION before
     * getSession() has finished reading AsyncStorage.
     *
     * We therefore keep track of whether the persisted-session
     * lookup has completed. This prevents a temporary null
     * INITIAL_SESSION event from logging the user out during
     * app startup/refresh.
     */
    let sessionRestored = false;

    /**
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

    /**
     * Subscribe before loading the persisted session so an auth event cannot
     * be missed during startup.
     */
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      /**
       * IMPORTANT:
       *
       * INITIAL_SESSION can temporarily contain null while Supabase is
       * still restoring the persisted session from AsyncStorage.
       *
       * Do NOT allow that temporary null to overwrite the current session.
       *
       * Once getSession() has completed, normal auth events are allowed
       * to update the session normally.
       */
      if (event === 'INITIAL_SESSION' && !sessionRestored) {
        if (nextSession) {
          setSession(nextSession);
        }
      } else {
        setSession(nextSession);
      }

      /**
       * These events are not explicit login actions.
       *
       * The actual signIn/signUp/signOut functions control loading
       * for explicit user actions.
       */
      if (
        event === 'SIGNED_IN' ||
        event === 'INITIAL_SESSION' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'SIGNED_OUT'
      ) {
        setLoading(false);
      }
    });

    /**
     * Restore the existing Supabase session from AsyncStorage.
     */
    const loadStoredSession = async () => {
      try {
        const {
          data: { session: storedSession },
          error,
        } = await supabase.auth.getSession();

        if (!mounted) return;

        console.log(
          'AUTH STORED SESSION:',
          !!storedSession,
        );
        console.log(
          'AUTH STORED USER:',
          storedSession?.user?.email ?? 'none',
        );

        if (error) {
          console.error('AUTH SESSION LOAD ERROR:', error);

          /**
           * We have now completed the persisted-session lookup.
           */
          sessionRestored = true;

          setSession(null);
        } else {
          /**
           * getSession() is the authoritative source for the
           * persisted session during startup.
           *
           * Mark restoration complete BEFORE updating the state.
           */
          sessionRestored = true;

          setSession(storedSession);
        }
      } catch (error) {
        if (mounted) {
          console.error('AUTH SESSION LOAD EXCEPTION:', error);

          /**
           * We have completed the attempt to restore the session.
           */
          sessionRestored = true;

          setSession(null);
        }
      } finally {
        if (mounted) {
          /**
           * Session restoration is complete.
           *
           * This is separate from normal authentication loading.
           */
          setInitializing(false);
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

  /**
   * Configure RevenueCat whenever a Supabase user is available.
   */
  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    configureRevenueCat(session.user.id).catch((error) => {
      console.error('REVENUECAT CONFIGURATION ERROR:', error);
    });
  }, [session?.user?.id]);

  /**
   * Sign in
   *
   * This is an explicit user action, so loading is enabled here.
   */
  const signIn = useCallback(
    async (email: string, password: string) => {
      setLoading(true);

      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          setLoading(false);
        }

        return {
          error: error?.message ?? null,
        };
      } catch (error) {
        setLoading(false);

        return {
          error:
            error instanceof Error
              ? error.message
              : 'Unable to sign in. Please try again.',
        };
      }
    },
    [],
  );

  /**
   * Sign up
   */
  const signUp = useCallback(
    async (
      email: string,
      password: string,
      metadata: SignUpMetadata,
    ) => {
      setLoading(true);

      try {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: metadata.full_name,
              username: metadata.username,
            },
            emailRedirectTo: 'mysidekick://confirm-email',
          },
        });

        setLoading(false);

        return {
          error: error?.message ?? null,
        };
      } catch (error) {
        setLoading(false);

        return {
          error:
            error instanceof Error
              ? error.message
              : 'Unable to create your account. Please try again.',
        };
      }
    },
    [],
  );

  /**
   * Resend confirmation email
   */
  const resendConfirmationEmail = useCallback(
    async (email: string) => {
      setLoading(true);

      try {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: email.trim(),
          options: {
            emailRedirectTo: 'mysidekick://confirm-email',
          },
        });

        setLoading(false);

        return {
          error: error?.message ?? null,
        };
      } catch (error) {
        setLoading(false);

        return {
          error:
            error instanceof Error
              ? error.message
              : 'Unable to resend the confirmation email.',
        };
      }
    },
    [],
  );

  /**
   * Send password reset email
   */
  const sendPasswordReset = useCallback(
    async (email: string) => {
      setLoading(true);

      try {
        const { error } =
          await supabase.auth.resetPasswordForEmail(
            email.trim(),
            {
              redirectTo: 'mysidekick://reset-password',
            },
          );

        setLoading(false);

        return {
          error: error?.message ?? null,
        };
      } catch (error) {
        setLoading(false);

        return {
          error:
            error instanceof Error
              ? error.message
              : 'Unable to send the password reset email.',
        };
      }
    },
    [],
  );

  /**
   * Update password
   */
  const updatePassword = useCallback(
    async (password: string) => {
      setLoading(true);

      try {
        const { error } =
          await supabase.auth.updateUser({
            password,
          });

        setLoading(false);

        return {
          error: error?.message ?? null,
        };
      } catch (error) {
        setLoading(false);

        return {
          error:
            error instanceof Error
              ? error.message
              : 'Unable to update your password.',
        };
      }
    },
    [],
  );

  /**
   * Sign out
   */
  const signOut = useCallback(async () => {
    setLoading(true);

    try {
      /**
       * Local sign-out clears the session on this device only.
       */
      const { error } = await supabase.auth.signOut({
        scope: 'local',
      });

      setLoading(false);

      return {
        error: error?.message ?? null,
      };
    } catch (error) {
      setLoading(false);

      return {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to sign out. Please try again.',
      };
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      initializing,
      signIn,
      signUp,
      resendConfirmationEmail,
      sendPasswordReset,
      updatePassword,
      signOut,
    }),
    [
      session,
      loading,
      initializing,
      signIn,
      signUp,
      resendConfirmationEmail,
      sendPasswordReset,
      updatePassword,
      signOut,
    ],
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