import { useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useApp } from '@/components/AppProvider';
import SidekickAvatar from '@/components/SidekickAvatar';
import { supabase } from '@/lib/supabase';

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

type Profile = {
  user_id: string;
  display_name: string;
  username: string;
  title: string | null;
  bio: string | null;
  sidekick_id: string | null;
};

export default function ChatProfileScreen() {
  const { id: rawId } = useLocalSearchParams<{
    id: string | string[];
  }>();

  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const appContext = useApp() as any;

  const {
    isDark,
    accentForeground,
  } = appContext;

  const isBlackDark =
    isDark && appContext.accent_family === 'black';

  const colors = isDark
    ? {
        bg: '#090909',
        text: '#F4F2EE',
        muted: '#AAA59D',
        border: '#2A2A2A',
      }
    : {
        bg: '#FBFAF8',
        text: '#27241F',
        muted: '#8F8A82',
        border: '#ECE9E4',
      };

  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      if (!id) {
        if (mounted) {
          setError('Profile not found.');
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);

      try {
        /*
         * Load the friend's public social profile.
         *
         * We keep this query limited to columns that already
         * exist in the current social_profiles setup.
         */
        const {
          data: socialRow,
          error: socialError,
        } = await supabase
          .from('social_profiles')
          .select(
            'user_id, display_name, username, title, bio'
          )
          .eq('user_id', id)
          .maybeSingle();

        if (socialError) {
          console.warn(
            'SOCIAL PROFILE LOAD ERROR:',
            socialError
          );
        }

        /*
         * Also load the friend's main profile.
         *
         * This is important because Bio and Title are entered
         * on the main profile screen.
         *
         * If the values are available here, they take priority.
         */
        const {
          data: profileRow,
          error: profileError,
        } = await supabase
          .from('profiles')
          .select(
            'user_id, display_name, username, title, bio, sidekick_id'
          )
          .eq('user_id', id)
          .maybeSingle();

        if (profileError) {
          console.warn(
            'MAIN PROFILE LOAD ERROR:',
            profileError
          );
        }

        /*
         * Combine the two profile sources.
         *
         * Main profile values are preferred for:
         * - display name
         * - username
         * - title
         * - bio
         * - sidekick
         *
         * social_profiles acts as the fallback.
         */
        if (!profileRow && !socialRow) {
          if (mounted) {
            setError(
              'Could not load this profile.'
            );
          }

          console.error(
            'PROFILE NOT FOUND:',
            id
          );

          return;
        }

        const displayName =
          profileRow?.display_name?.trim() ||
          socialRow?.display_name?.trim() ||
          'User';

        const username =
          profileRow?.username?.trim() ||
          socialRow?.username?.trim() ||
          '';

        const title =
          profileRow?.title?.trim() ||
          socialRow?.title?.trim() ||
          null;

        const bio =
          profileRow?.bio?.trim() ||
          socialRow?.bio?.trim() ||
          null;

        const sidekickId =
          profileRow?.sidekick_id ??
          null;

        if (mounted) {
          setProfile({
            user_id:
              profileRow?.user_id ||
              socialRow?.user_id ||
              id,

            display_name: displayName,

            username,

            title,

            bio,

            sidekick_id: sidekickId,
          });
        }
      } catch (e) {
        console.error(
          'PROFILE LOAD EXCEPTION:',
          e
        );

        if (mounted) {
          setError(
            'Could not load this profile.'
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, [id]);

  const nameColor = isBlackDark
    ? '#FFFFFF'
    : accentForeground;

  const initials = (
    profile?.display_name || '?'
  )
    .trim()
    .slice(0, 1)
    .toUpperCase();

  const title =
    profile?.title?.trim() || '';

  const bio =
    profile?.bio?.trim() || '';

  return (
    <SafeAreaView
      style={[
        styles.safe,
        {
          backgroundColor: colors.bg,
        },
      ]}
    >
      {/* HEADER */}
      <View
        style={[
          styles.header,
          {
            borderBottomColor:
              colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.headerBtn}
        >
          <ChevronLeft
            color={colors.text}
            size={26}
          />
        </Pressable>

        <Text
          style={[
            styles.headerTitle,
            {
              color:
                isDark ? '#FFFFFF' : accentForeground,
            },
          ]}
        >
          PROFILE
        </Text>

        <View style={styles.headerBtn} />
      </View>

      {/* LOADING */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator
            color={accentForeground}
            size="large"
          />

          <Text
            style={[
              styles.centerText,
              {
                color: colors.muted,
              },
            ]}
          >
            Loading profile…
          </Text>
        </View>
      ) : error ? (
        /* ERROR */
        <View style={styles.center}>
          <Text
            style={[
              styles.errorText,
              {
                color: colors.text,
              },
            ]}
          >
            {error}
          </Text>

          <Pressable
            onPress={() => router.back()}
            style={[
              styles.backButton,
              {
                backgroundColor:
                  accentForeground,
              },
            ]}
          >
            <Text style={styles.backButtonText}>
              Go back
            </Text>
          </Pressable>
        </View>
      ) : (
        /* PROFILE */
        <ScrollView
          contentContainerStyle={
            styles.content
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.profile}>
            {/* SIDEKICK / AVATAR */}
            {profile?.sidekick_id ? (
              <View
                style={
                  styles.sidekickAvatarWrap
                }
              >
                <SidekickAvatar
                  sidekickId={
                    profile.sidekick_id
                  }
                  size={96}
                />
              </View>
            ) : (
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor:
                      accentForeground,
                  },
                ]}
              >
                <Text
                  style={styles.avatarText}
                >
                  {initials}
                </Text>
              </View>
            )}

            {/* NAME */}
            <Text
              style={[
                styles.name,
                {
                  color: nameColor,
                },
              ]}
            >
              {profile?.display_name ||
                'User'}
            </Text>

            {/* USERNAME */}
            {!!profile?.username && (
              <Text
                style={[
                  styles.username,
                  {
                    color: colors.muted,
                  },
                ]}
              >
                @{profile.username}
              </Text>
            )}

            {/* TITLE */}
            {!!title && (
              <Text
                style={[
                  styles.title,
                  {
                    color: isBlackDark
                      ? '#B8B5AF'
                      : accentForeground,
                  },
                ]}
              >
                {title}
              </Text>
            )}

            {/* BIO */}
            <Text
              style={[
                styles.bio,
                {
                  color: colors.text,
                },
              ]}
            >
              {bio || 'No bio added yet.'}
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 36,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },

  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 15,
    letterSpacing: 1.2,
  },

  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 54,
    paddingBottom: 48,
  },

  profile: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },

  sidekickAvatarWrap: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginBottom: 20,
    overflow: 'hidden',
  },

  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },

  avatarText: {
    color: '#FFFFFF',
    fontFamily: FONT_BOLD,
    fontSize: 34,
  },

  name: {
    fontFamily: FONT_BOLD,
    fontSize: 25,
    lineHeight: 32,
    textAlign: 'center',
  },

  username: {
    fontFamily: FONT_MED,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
    textAlign: 'center',
  },

  title: {
    fontFamily: FONT_MED,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    textAlign: 'center',
  },

  bio: {
    width: '100%',
    maxWidth: 360,
    fontFamily: FONT,
    fontSize: 15,
    lineHeight: 24,
    marginTop: 20,
    textAlign: 'center',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },

  centerText: {
    fontFamily: FONT,
    fontSize: 14,
  },

  errorText: {
    fontFamily: FONT_MED,
    fontSize: 15,
    textAlign: 'center',
  },

  backButton: {
    minWidth: 120,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  backButtonText: {
    color: '#FFFFFF',
    fontFamily: FONT_SEMI,
    fontSize: 14,
  },
});