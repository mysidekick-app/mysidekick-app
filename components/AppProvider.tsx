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
};

type AppContextValue = AppSettings & {
  loading: boolean;
  isDark: boolean;
  accent: AccentPalette;
  accentForeground: string;
  accentWash: string;
  onAccent: string;
  updateSettings: (
    changes: Partial<AppSettings>
  ) => Promise<void>;
};

const fallbackSettings: AppSettings = {
  display_name: '',
  title: '',
  bio: '',
  theme_mode: 'system',
  accent_family: 'blue',
  currency_code: 'KES',
};

export const accentPalettes: Record<
  AccentFamily,
  AccentPalette
> = {
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

  const [loading, setLoading] = useState(true);

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

      const { data, error } = await supabase
        .from('assistant_app_settings')
        .select(
          'display_name, title, bio, theme_mode, accent_family, currency_code'
        )
        .eq('user_id', user.id)
        .maybeSingle();

      if (!active) {
        return;
      }

      if (error) {
        console.error(
          'Failed to load app settings:',
          error.message
        );

        setSettings({
          ...fallbackSettings,
          display_name:
            user.user_metadata?.full_name ??
            user.email?.split('@')[0] ??
            '',
        });

        setLoading(false);
        return;
      }

      if (data) {
        setSettings({
          ...fallbackSettings,
          ...data,
        });
      } else {
        setSettings({
          ...fallbackSettings,
          display_name:
            user.user_metadata?.full_name ??
            user.email?.split('@')[0] ??
            '',
        });
      }

      setLoading(false);
    }

    loadSettings();

    return () => {
      active = false;
    };
  }, [user, authLoading]);

  const updateSettings = async (
    changes: Partial<AppSettings>
  ) => {
    if (!user) {
      console.warn(
        'Cannot update app settings without an authenticated user.'
      );

      return;
    }

    const next: AppSettings = {
      ...settings,
      ...changes,
    };

    setSettings(next);

    const { error } = await supabase
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
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      );

    if (error) {
      console.error(
        'Failed to save app settings:',
        error.message
      );
    }
  };

  const isDark =
    settings.theme_mode === 'dark' ||
    (
      settings.theme_mode === 'system' &&
      systemScheme === 'dark'
    );

  const accent =
    accentPalettes[settings.accent_family] ??
    accentPalettes.blue;

  const accentForeground = accent.standard;
  const accentWash = accent.wash;
  const onAccent = '#FFFFFF';

  const value = useMemo<AppContextValue>(
    () => ({
      ...settings,

      loading:
        loading || authLoading,

      isDark,

      accent,

      accentForeground,

      accentWash,

      onAccent,

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
    ]
  );

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);

  if (context === null) {
    throw new Error(
      'useApp must be used inside AppProvider'
    );
  }

  return context;
}
