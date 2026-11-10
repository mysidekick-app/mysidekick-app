import React, { useEffect } from 'react';

import {
  Tabs,
  usePathname,
  useRouter,
  useLocalSearchParams,
} from 'expo-router';

import {
  Home,
  MessageCircle,
  User,
} from 'lucide-react-native';

import {
  BackHandler,
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';

import { useApp } from '@/components/AppProvider';

export default function TabsLayout() {
  const {
    accentForeground,
    isDark,
  } = useApp();

  const pathname = usePathname();
  const router = useRouter();
  const routeParams = useLocalSearchParams<{ shareStreak?: string; flex?: string }>();

  // Hide the bottom navbar while the Chat tab is displaying Share Streak mode[cite: 1].
  const isShareStreak =
    routeParams.shareStreak === 'true' ||
    routeParams.shareStreak === '1' ||
    routeParams.flex === 'true' ||
    routeParams.flex === '1';

  const inactiveColor = isDark
    ? '#D4D4D8'
    : '#52525B';

  const navBackground = isDark
    ? '#121212'
    : '#FFFFFF';

  const navBorder = '#000000';

  const screenBackground = isDark
    ? '#000000'
    : '#FFFFFF';

  /*
   * Show the bottom navbar only on the main tabs:
   * Chat, Home (Modules), and Profile.
   * All sub-module routes and share streaks hide it[cite: 1].
   */
  const showNavbar =
    !isShareStreak &&
    (pathname === '/' ||
      pathname === '/index' ||
      pathname === '/chat' ||
      pathname === '/modules' ||
      pathname === '/profile');

  /*
   * ============================================================
   * SYSTEM BACK
   * ============================================================
   *
   * When the user is inside a module and uses the phone's
   * system back button / back gesture, always return to
   * Modules Home[cite: 1].
   */

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const isInsideModule =
      pathname.startsWith('/plants') ||
      pathname.startsWith('/planner') ||
      pathname.startsWith('/habits') ||
      pathname.startsWith('/bookmarks') ||
      pathname.startsWith('/reminders') ||
      pathname.startsWith('/modules/');

    if (!isInsideModule) {
      return;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        router.replace('/modules');
        return true;
      },
    );

    return () => {
      subscription.remove();
    };
  }, [pathname, router]);

  /*
   * ============================================================
   * UI ONLY
   * ============================================================
   *
   * Determine which tab gets the selected visual treatment[cite: 1].
   */

  const isProfileSelected =
    pathname === '/profile' ||
    pathname.startsWith('/profile/') ||
    pathname === '/support';

  const isModuleSelected =
    pathname === '/modules' ||
    pathname.startsWith('/modules/') ||
    pathname.startsWith('/plants') ||
    pathname.startsWith('/planner') ||
    pathname.startsWith('/habits') ||
    pathname.startsWith('/bookmarks') ||
    pathname.startsWith('/reminders');

  const isChatSelected =
    !isProfileSelected &&
    !isModuleSelected;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        sceneStyle: {
          backgroundColor:
            screenBackground,
        },

        /*
         * ========================================================
         * NAVBAR STYLING
         * ========================================================
         */

        tabBarStyle: showNavbar
          ? {
              height: 78,
              backgroundColor: navBackground,
              borderTopColor: navBorder,
              borderTopWidth: 0,
              paddingTop: 10,
              paddingBottom: 10,
              paddingHorizontal: 14,
              elevation: 8,
              shadowColor: '#000000',
              shadowOpacity: 1,
              shadowRadius: 0,
              shadowOffset: {
                width: 0,
                height: -4,
              },
            }
          : {
              display: 'none',
            },

        tabBarShowLabel: false,

        tabBarItemStyle: {
          height: 58,
          paddingHorizontal: 8,
          paddingVertical: 6,
        },
      }}
    >
      {/* ============================================================
          CHAT
          ============================================================ */}

      <Tabs.Screen
        name="index"
        options={{
          title: 'Chat',

          tabBarIcon: () => (
            <View
              style={[
                styles.tab,
                isChatSelected && {
                  backgroundColor:
                    accentForeground,
                  borderWidth: 2,
                  borderColor: '#000000',
                  shadowColor: '#000000',
                  shadowOffset: { width: 3, height: 3 },
                  shadowOpacity: 1,
                  shadowRadius: 0,
                  elevation: 4,
                },
                isChatSelected &&
                  styles.selectedTab,
              ]}
            >
              <MessageCircle
                color={
                  isChatSelected
                    ? '#000000'
                    : inactiveColor
                }
                size={22}
                strokeWidth={
                  isChatSelected
                    ? 2.6
                    : 2.2
                }
              />

              {isChatSelected && (
                <Text
                  style={
                    styles.selectedText
                  }
                >
                  Chat
                </Text>
              )}
            </View>
          ),
        }}
      />

      {/* ============================================================
          HOME
          ============================================================ */}

      <Tabs.Screen
        name="modules"
        options={{
          title: 'Home',

          tabBarIcon: () => (
            <View
              style={[
                styles.tab,
                isModuleSelected && {
                  backgroundColor:
                    accentForeground,
                  borderWidth: 2,
                  borderColor: '#000000',
                  shadowColor: '#000000',
                  shadowOffset: { width: 3, height: 3 },
                  shadowOpacity: 1,
                  shadowRadius: 0,
                  elevation: 4,
                },
                isModuleSelected &&
                  styles.selectedTab,
              ]}
            >
              <Home
                color={
                  isModuleSelected
                    ? '#000000'
                    : inactiveColor
                }
                size={22}
                strokeWidth={
                  isModuleSelected
                    ? 2.6
                    : 2.2
                }
              />

              {isModuleSelected && (
                <Text
                  style={
                    styles.selectedText
                  }
                >
                  Home
                </Text>
              )}
            </View>
          ),
        }}
      />

      {/* ============================================================
          PROFILE
          ============================================================ */}

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',

          tabBarIcon: () => (
            <View
              style={[
                styles.tab,
                isProfileSelected && {
                  backgroundColor:
                    accentForeground,
                  borderWidth: 2,
                  borderColor: '#000000',
                  shadowColor: '#000000',
                  shadowOffset: { width: 3, height: 3 },
                  shadowOpacity: 1,
                  shadowRadius: 0,
                  elevation: 4,
                },
                isProfileSelected &&
                  styles.selectedTab,
              ]}
            >
              <User
                color={
                  isProfileSelected
                    ? '#000000'
                    : inactiveColor
                }
                size={22}
                strokeWidth={
                  isProfileSelected
                    ? 2.6
                    : 2.2
                }
              />

              {isProfileSelected && (
                <Text
                  style={
                    styles.selectedText
                  }
                >
                  Profile
                </Text>
              )}
            </View>
          ),
        }}
      />

      {/* ============================================================
          HIDDEN ROUTES
          ============================================================ */}

      <Tabs.Screen name="bookmarks" options={{ href: null }} />
      <Tabs.Screen name="chat" options={{ href: null }} />
      <Tabs.Screen name="habits" options={{ href: null }} />
      <Tabs.Screen name="plants" options={{ href: null }} />
      <Tabs.Screen name="planner" options={{ href: null }} />
      <Tabs.Screen name="reminders" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="support" options={{ href: null }} />
      <Tabs.Screen name="modules/games" options={{ href: null }} />
      <Tabs.Screen name="modules/finances" options={{ href: null }} />
      <Tabs.Screen name="modules/lists" options={{ href: null }} />
      <Tabs.Screen name="modules/wellbeing" options={{ href: null }} />
    </Tabs>
  );
}

/* ================================================================
   NAVBAR STYLES
   ================================================================ */

const styles = StyleSheet.create({
  tab: {
    minWidth: 46,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 12,
  },

  selectedTab: {
    minWidth: 96,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 7,
  },

  selectedText: {
    color: '#000000',
    fontFamily: 'Poppins-Bold',
    fontSize: 13,
    lineHeight: 18,
    includeFontPadding: false,
  },
});
