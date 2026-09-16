import {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { Platform, useColorScheme } from 'react-native';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { registerForPushNotificationsAsync } from '@/lib/notifications';

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

  // Selected Sidekick sticker/avatar.
  // null means the user has not selected a Sidekick yet.
  sidekick_id: string | null;
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

  // No Sidekick selected yet.
  // SidekickAvatar will use assets/sidekick-favicon.png.
  sidekick_id: null,
};

export const accentPalettes: Record<
  AccentFamily,
  AccentPalette
> = {
  black: {
    light: '#5A5A5A',
    standard: '#333333',
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
       * Username, profile picture, and Sidekick
       * selection live in:
       * public.profiles
       */
      const {
        data: profileData,
        error: profileError,
      } = await supabase
        .from('profiles')
        .select(
          'username, avatar_url, sidekick_id'
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

      const savedAccentFamily =
        appSettingsData?.accent_family;

      const validAccentFamily =
        savedAccentFamily &&
        savedAccentFamily in accentPalettes
          ? (savedAccentFamily as AccentFamily)
          : fallbackSettings.accent_family;

      const savedThemeMode =
        appSettingsData?.theme_mode;

      const validThemeMode =
        savedThemeMode === 'system' ||
        savedThemeMode === 'light' ||
        savedThemeMode === 'dark'
          ? savedThemeMode
          : fallbackSettings.theme_mode;

      const savedSettings: AppSettings = {
        ...fallbackSettings,

        display_name: displayName,

        title:
          appSettingsData?.title ?? '',

        bio:
          appSettingsData?.bio ?? '',

        theme_mode:
          validThemeMode,

        accent_family:
          validAccentFamily,

        currency_code:
          appSettingsData?.currency_code ??
          fallbackSettings.currency_code,

        timezone:
          appSettingsData?.timezone ||
          fallbackSettings.timezone,

        username:
          profileData?.username ?? '',

        avatar_url:
          profileData?.avatar_url ?? null,

        sidekick_id:
          profileData?.sidekick_id ?? null,
      };

      setSettings(savedSettings);
      setLoading(false);
    }

    loadSettings();

    return () => {
      active = false;
    };
  }, [user, authLoading]);

  /*
   * Register the signed-in user's device for push notifications.
   *
   * This runs only after authentication is ready and only on
   * native iOS/Android. The Expo push token is cached locally
   * per user/device and saved to public.push_tokens so the
   * backend can send notifications to this specific device.
   */
  useEffect(() => {
    if (authLoading || !user?.id) {
      return;
    }

    const userId = user.id;

    let active = true;

    async function registerDevice() {
      try {
        // Push registration is handled by the native app.
        if (Platform.OS === 'web') {
          return;
        }

        const expoPushToken =
  await registerForPushNotificationsAsync(userId);

        if (!active || !expoPushToken) {
          return;
        }

        const { error } = await supabase
          .from('push_tokens')
          .upsert(
            {
              user_id: userId,
              expo_push_token: expoPushToken,
              platform: Platform.OS,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: 'user_id,expo_push_token',
            }
          );

        if (error) {
          console.error(
            'Failed to save push token:',
            error.message
          );

          return;
        }

        console.log(
          'Push token saved successfully.'
        );
      } catch (error) {
        console.error(
          'Push notification registration failed:',
          error
        );
      }
    }

    registerDevice();

    return () => {
      active = false;
    };
  }, [user?.id, authLoading]);

  /*
   * Publish the signed-in user's online presence globally
   * so chat screens can show Active / Inactive.
   */
  useEffect(() => {
    if (!user?.id) {
      return;
    }

    const channel = supabase.channel(
      'global-presence',
      {
        config: {
          presence: {
            key: user.id,
          },
        },
      }
    );

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
     * Update local state immediately.
     */
    const next: AppSettings = {
      ...settings,
      ...changes,
    };

    setSettings(next);

    /*
     * Save application settings.
     *
     * We deliberately do NOT use upsert here.
     *
     * First try to UPDATE the user's existing row.
     * If no row exists, INSERT a new row.
     *
     * This makes the settings persistence independent
     * of an onConflict/user_id unique constraint.
     */
    const hasAppSettingsChanges =
      changes.display_name !== undefined ||
      changes.title !== undefined ||
      changes.bio !== undefined ||
      changes.theme_mode !== undefined ||
      changes.accent_family !== undefined ||
      changes.currency_code !== undefined ||
      changes.timezone !== undefined;

    if (hasAppSettingsChanges) {
      const settingsData = {
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
      };

      /*
       * First try to update the existing settings row.
       */
      const {
        data: updatedRows,
        error: updateError,
      } = await supabase
        .from('assistant_app_settings')
        .update(settingsData)
        .eq('user_id', user.id)
        .select('user_id');

      if (updateError) {
        console.error(
          'Failed to update app settings:',
          updateError.message
        );
      } else if (
        !updatedRows ||
        updatedRows.length === 0
      ) {
        /*
         * No row exists yet, so create it.
         */
        const {
          error: insertError,
        } = await supabase
          .from('assistant_app_settings')
          .insert({
            user_id: user.id,
            ...settingsData,
          });

        if (insertError) {
          console.error(
            'Failed to insert app settings:',
            insertError.message
          );
        }
      }

      /*
       * ---------------------------------------------------------
       * PUBLIC SOCIAL PROFILE SYNC
       * ---------------------------------------------------------
       *
       * Bio and Title are stored privately in
       * assistant_app_settings.
       *
       * Friends cannot use that private settings table to display
       * another user's profile.
       *
       * social_profiles is the public profile used by chat.
       *
       * Whenever the user changes their display name, title, or bio,
       * keep the public social profile synchronized.
       */
      if (
        changes.display_name !== undefined ||
        changes.title !== undefined ||
        changes.bio !== undefined
      ) {
        const socialProfileUpdate: {
          display_name?: string;
          title?: string;
          bio?: string;
          updated_at: string;
        } = {
          updated_at:
            new Date().toISOString(),
        };

        if (
          changes.display_name !== undefined
        ) {
          socialProfileUpdate.display_name =
            next.display_name;
        }

        if (
          changes.title !== undefined
        ) {
          socialProfileUpdate.title =
            next.title;
        }

        if (
          changes.bio !== undefined
        ) {
          socialProfileUpdate.bio =
            next.bio;
        }

        const {
          data: socialProfileRows,
          error: socialProfileError,
        } = await supabase
          .from('social_profiles')
          .update(socialProfileUpdate)
          .eq('user_id', user.id)
          .select('user_id');

        if (socialProfileError) {
          console.error(
            'Failed to sync public social profile:',
            socialProfileError.message
          );
        } else if (
          !socialProfileRows ||
          socialProfileRows.length === 0
        ) {
          /*
           * We intentionally do not create a new social_profiles
           * row here.
           *
           * social_profiles already exists for users who are
           * participating in the social/chat system, and its
           * existing creation flow controls the required `id`,
           * username, and other fields.
           */
          console.warn(
            'No social_profiles row found for user. Bio and title could not be synced.'
          );
        }
      }
    }

    /*
     * Username, profile picture, and Sidekick
     * selection live in public.profiles.
     */
    if (
      changes.username !== undefined ||
      changes.avatar_url !== undefined ||
      changes.sidekick_id !== undefined
    ) {
      const profileUpdate: {
        user_id: string;
        username?: string;
        avatar_url?: string | null;
        sidekick_id?: string | null;
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

      if (
        changes.sidekick_id !== undefined
      ) {
        profileUpdate.sidekick_id =
          changes.sidekick_id;
      }

      /*
       * Keep the existing profile persistence behavior.
       */
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
    ] ?? accentPalettes.black;

  const accentForeground =
    accent.standard;

  const accentWash =
    accent.wash;

  const onAccent =
    '#FFFFFF';

  /*
   * General app-wide text color:
   * black text in light mode,
   * white text in dark mode.
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