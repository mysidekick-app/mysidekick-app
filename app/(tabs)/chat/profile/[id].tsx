import { useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { router, useLocalSearchParams } from 'expo-router';

import { ChevronLeft } from 'lucide-react-native';

import { useApp } from '@/components/AppProvider';

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
  tag: string | null;
  bio: string | null;
  avatar_url: string | null;
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

    const load = async () => {
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
         * social_profiles is the reliable public-profile source
         * already used by the chat.
         *
         * profiles is then used only to enrich the profile with
         * title, bio, and avatar when those fields are available.
         */
        const {
          data: socialRow,
          error: socialError,
        } = await supabase
          .from('social_profiles')
          .select(
            'user_id, display_name, username',
          )
          .eq('user_id', id)
          .maybeSingle();

        if (socialError) {
          console.error(
            'SOCIAL PROFILE LOAD ERROR:',
            socialError,
          );
        }

        const {
          data: profileRow,
          error: profileError,
        } = await supabase
          .from('profiles')
          .select(
            'user_id, display_name, username, title, bio, avatar_url',
          )
          .eq('user_id', id)
          .maybeSingle();

        if (profileError) {
          console.warn(
            'PROFILES TABLE LOAD ERROR:',
            profileError,
          );
        }

        const row = profileRow || socialRow;

        if (!row) {
          console.error(
            'PROFILE NOT FOUND:',
            id,
            {
              socialError,
              profileError,
            },
          );

          if (mounted) {
            setError(
              'Could not load this profile.',
            );
          }

          return;
        }

        if (mounted) {
          setProfile({
            user_id: row.user_id || id,
            display_name:
              row.display_name || 'User',
            username: row.username || '',
            title: profileRow?.title || null,
            tag: null,
            bio: profileRow?.bio || null,
            avatar_url:
              profileRow?.avatar_url || null,
          });
        }
      } catch (e) {
        console.error(
          'PROFILE LOAD EXCEPTION:',
          e,
        );

        if (mounted) {
          setError(
            'Could not load this profile.',
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();

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

  const title = profile?.title || '';

  return (
    <SafeAreaView
      style={[
        styles.safe,
        { backgroundColor: colors.bg },
      ]}
    >
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
              color: accentForeground,
            },
          ]}
        >
          PROFILE
        </Text>

        <View style={styles.headerBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator
            color={accentForeground}
            size="large"
          />

          <Text
            style={[
              styles.centerText,
              { color: colors.muted },
            ]}
          >
            Loading profile…
          </Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text
            style={[
              styles.errorText,
              { color: colors.text },
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
        <ScrollView
          contentContainerStyle={
            styles.content
          }
          showsVerticalScrollIndicator={
            false
          }
        >
          <View style={styles.profile}>
            {profile?.avatar_url ? (
              <Image
                source={{
                  uri: profile.avatar_url,
                }}
                style={styles.avatarImage}
              />
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

            <Text
              style={[
                styles.name,
                { color: nameColor },
              ]}
            >
              {profile?.display_name ||
                'User'}
            </Text>

            <Text
              style={[
                styles.username,
                { color: colors.muted },
              ]}
            >
              @{profile?.username ||
                'username'}
            </Text>

            {!!title && (
              <Text
                style={[
                  styles.title,
                  {
                    color:
                      accentForeground,
                  },
                ]}
              >
                {title}
              </Text>
            )}

            <Text
              style={[
                styles.bio,
                { color: colors.text },
              ]}
            >
              {profile?.bio?.trim() ||
                'No bio added yet.'}
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

  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },

  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
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
