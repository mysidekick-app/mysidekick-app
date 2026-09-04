import {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';

export type ThemeMode = 'system' | 'light' | 'dark';

export type AccentFamily =
  | 'black'
  | 'red'
  | 'orange'
  | 'mustard'
  | 'green'
  | 'blue'
  | 'indigo'
  | 'violet';

export type AccentPalette = {
  light: string;
  standard: string;
  deep: string;
  wash: string;
};

type AppSettings = {
  display_name: string;
  title: string;
  bio: string;
  theme_mode: ThemeMode;
  accent_family: AccentFamily;
  currency_code: string;
  timezone: string;
  username: string;
  avatar_url: string | null;
};

type AppContextValue = AppSettings & {
  loading: boolean;
  isDark: boolean;
  accent: AccentPalette;
  accentForeground: string;
  accentWash: string;
  onAccent: string;
  text: string;
  updateSettings: (
    changes: Partial<AppSettings>
  ) => Promise<void>;
};

const fallbackSettings: AppSettings = {
  display_name: '',
  title: '',
  bio: '',
  theme_mode: 'system',
  accent_family: 'black',
  currency_code: 'KES',
  timezone: 'Africa/Nairobi',
  username: '',
  avatar_url: null,
};

export const accentPalettes: Record<
  AccentFamily,
  AccentPalette
> = {
  black: {
    light: '#5A5A5A',
    standard: '#3F3F3F',
    deep: '#111111',
    wash: '#E9E9E9',
  },

  red: {
    light: '#FF8E86',
    standard: '#E05252',
    deep: '#A92F39',
    wash: '#FFF0EE',
  },

  orange: {
    light: '#FFB064',
    standard: '#EE8332',
    deep: '#B7551B',
    wash: '#FFF3E7',
  },

  mustard: {
    light: '#EACB61',
    standard: '#C89B27',
    deep: '#8E6A13',
    wash: '#FFF8DD',
  },

  green: {
    light: '#7CCB93',
    standard: '#3E9D66',
    deep: '#236A47',
    wash: '#EAF8EF',
  },

  blue: {
    light: '#71B8FF',
    standard: '#2379E8',
    deep: '#1451A3',
    wash: '#EAF3FF',
  },

  indigo: {
    light: '#8599F2',
    standard: '#5268D6',
    deep: '#344399',
    wash: '#EEF0FF',
  },

  violet: {
    light: '#B28BEA',
    standard: '#8452C7',
    deep: '#5B3296',
    wash: '#F4EEFF',
  },
};

const AppContext =
  createContext<AppContextValue | null>(null);

export function AppProvider({
  children,
}: PropsWithChildren) {
  const systemScheme = useColorScheme();

  const {
    user,
    loading: authLoading,
  } = useAuth();

  const [settings, setSettings] =
    useState<AppSettings>(fallbackSettings);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      if (authLoading) {
        return;
      }

      if (!user) {
        if (active) {
          setSettings(fallbackSettings);
          setLoading(false);
        }

        return;
      }

      setLoading(true);

      /*
       * Application settings live in:
       * public.assistant_app_settings
       */

      const {
        data: appSettingsData,
        error: appSettingsError,
      } = await supabase
        .from('assistant_app_settings')
        .select(
          `
            display_name,
            title,
            bio,
            theme_mode,
            accent_family,
            currency_code,
            timezone
          `
        )
        .eq('user_id', user.id)
        .maybeSingle();

      /*
       * Username and profile picture live in:
       * public.profiles
       */

      const {
        data: profileData,
        error: profileError,
      } = await supabase
        .from('profiles')
        .select(
          'username, avatar_url'
        )
        .eq('user_id', user.id)
        .maybeSingle();

      if (!active) {
        return;
      }

      if (appSettingsError) {
        console.error(
          'Failed to load app settings:',
          appSettingsError.message
        );
      }

      if (profileError) {
        console.error(
          'Failed to load profile:',
          profileError.message
        );
      }

      const displayName =
        appSettingsData?.display_name ??
        user.user_metadata?.full_name ??
        user.email?.split('@')[0] ??
        '';

      setSettings({
        ...fallbackSettings,
        ...(appSettingsData ?? {}),

        display_name: displayName,

        username:
          profileData?.username ?? '',

        avatar_url:
          profileData?.avatar_url ?? null,

        /*
         * Keep Nairobi as the fallback if an older
         * account does not yet have a timezone.
         */
        timezone:
          appSettingsData?.timezone ??
          'Africa/Nairobi',
      });

      setLoading(false);
    }

    loadSettings();

    return () => {
      active = false;
    };
  }, [user, authLoading]);

  // Publish the signed-in user's online presence globally so chat screens
  // can show Active / Inactive without adding a database presence table.
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase.channel('global-presence', {
      config: { presence: { key: user.id } },
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: user.id,
          online_at: new Date().toISOString(),
        });
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const updateSettings = async (
    changes: Partial<AppSettings>
  ) => {
    if (!user) {
      console.warn(
        'Cannot update app settings without an authenticated user.'
      );

      return;
    }

    /*
     * Update local state immediately so the UI
     * responds without waiting for Supabase.
     */
    const next: AppSettings = {
      ...settings,
      ...changes,
    };

    setSettings(next);

    /*
     * Application settings.
     *
     * Username and avatar_url are NOT stored here.
     */
    const {
      error: settingsError,
    } = await supabase
      .from('assistant_app_settings')
      .upsert(
        {
          user_id: user.id,
          display_name: next.display_name,
          title: next.title,
          bio: next.bio,
          theme_mode: next.theme_mode,
          accent_family: next.accent_family,
          currency_code: next.currency_code,
          timezone:
            next.timezone || 'Africa/Nairobi',
          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      );

    if (settingsError) {
      console.error(
        'Failed to save app settings:',
        settingsError.message
      );
    }

    /*
     * Username and profile picture live in
     * public.profiles.
     *
     * Only update them when explicitly passed
     * to updateSettings().
     */
    if (
      changes.username !== undefined ||
      changes.avatar_url !== undefined
    ) {
      const profileUpdate: {
        user_id: string;
        username?: string;
        avatar_url?: string | null;
        updated_at: string;
      } = {
        user_id: user.id,
        updated_at:
          new Date().toISOString(),
      };

      if (
        changes.username !== undefined
      ) {
        profileUpdate.username =
          changes.username
            .trim()
            .toLowerCase();
      }

      if (
        changes.avatar_url !== undefined
      ) {
        profileUpdate.avatar_url =
          changes.avatar_url;
      }

      const {
        error: profileError,
      } = await supabase
        .from('profiles')
        .upsert(
          profileUpdate,
          {
            onConflict: 'user_id',
          }
        );

      if (profileError) {
        console.error(
          'Failed to save profile:',
          profileError.message
        );
      }
    }
  };

  const isDark =
    settings.theme_mode === 'dark' ||
    (
      settings.theme_mode === 'system' &&
      systemScheme === 'dark'
    );

  const accent =
    accentPalettes[
      settings.accent_family
    ] ?? accentPalettes.blue;

  const accentForeground =
    accent.standard;

  const accentWash =
    accent.wash;

  const onAccent =
    '#FFFFFF';

  /*
   * General app-wide text color: black text in light mode,
   * white text in dark mode. Use this wherever a component
   * currently hardcodes '#000000' / 'black' for text, so
   * that text stays visible against dark backgrounds.
   *
   * Note: this does NOT distinguish between dark-background
   * and white-background surfaces — a component that keeps
   * an explicit white background in dark mode will also get
   * white text from this token, which will be invisible
   * there. If you have such surfaces (white buttons/filters,
   * etc.), those specific components should keep a fixed
   * black text color instead of pulling from `text`.
   */
  const text =
    isDark ? '#FFFFFF' : '#000000';

  const value =
    useMemo<AppContextValue>(
      () => ({
        ...settings,

        loading:
          loading || authLoading,

        isDark,

        accent,

        accentForeground,

        accentWash,

        onAccent,

        text,

        updateSettings,
      }),
      [
        settings,
        loading,
        authLoading,
        isDark,
        accent,
        accentForeground,
        accentWash,
        text,
      ]
    );

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const context =
    useContext(AppContext);

  if (context === null) {
    throw new Error(
      'useApp must be used inside AppProvider'
    );
  }

  return context;
}