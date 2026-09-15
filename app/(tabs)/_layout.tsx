import React, { useEffect } from 'react';

import {
  Tabs,
  usePathname,
  useRouter,
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

  const inactiveColor = isDark
    ? '#8C8982'
    : '#A4A09A';

  const navBackground = isDark
    ? '#000000'
    : '#FFFFFF';

  const navBorder = isDark
    ? '#292929'
    : '#ECE9E4';

  const screenBackground = isDark
    ? '#000000'
    : '#FFFFFF';

  /*
   * ============================================================
   * SYSTEM BACK
   * ============================================================
   *
   * When the user is inside a module and uses the phone's
   * system back button / back gesture, always return to
   * Modules Home.
   *
   * Existing in-app arrows are NOT affected because this
   * only listens to the native Android BackHandler.
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
   * Determine which tab gets the selected visual treatment.
   *
   * Home remains selected while inside any module.
   */

  const isProfileSelected =
    pathname === '/profile' ||
    pathname.startsWith('/profile/');

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
         * NAVBAR
         * ========================================================
         *
         * This is only the visual styling of the existing
         * Expo Router tab bar.
         */

        tabBarStyle: {
          height: 78,
          backgroundColor:
            navBackground,
          borderTopColor:
            navBorder,
          borderTopWidth:
            StyleSheet.hairlineWidth,
          paddingTop: 10,
          paddingBottom: 10,
          paddingHorizontal: 14,
          elevation: 8,
          shadowOpacity: 0.08,
          shadowRadius: 8,
          shadowOffset: {
            width: 0,
            height: -2,
          },
        },

        /*
         * We display the selected label ourselves.
         */

        tabBarShowLabel: false,

        /*
         * Give each item comfortable space.
         */

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
                isChatSelected &&
                  styles.selectedTab,
                isChatSelected && {
                  backgroundColor:
                    accentForeground,
                },
              ]}
            >
              <MessageCircle
                color={
                  isChatSelected
                    ? '#FFFFFF'
                    : inactiveColor
                }
                size={22}
                strokeWidth={
                  isChatSelected
                    ? 2.3
                    : 2
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
                isModuleSelected &&
                  styles.selectedTab,
                isModuleSelected && {
                  backgroundColor:
                    accentForeground,
                },
              ]}
            >
              <Home
                color={
                  isModuleSelected
                    ? '#FFFFFF'
                    : inactiveColor
                }
                size={22}
                strokeWidth={
                  isModuleSelected
                    ? 2.3
                    : 2
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
                isProfileSelected &&
                  styles.selectedTab,
                isProfileSelected && {
                  backgroundColor:
                    accentForeground,
                },
              ]}
            >
              <User
                color={
                  isProfileSelected
                    ? '#FFFFFF'
                    : inactiveColor
                }
                size={22}
                strokeWidth={
                  isProfileSelected
                    ? 2.3
                    : 2
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

      <Tabs.Screen
        name="bookmarks"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="chat"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="habits"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="plants"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="planner"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="reminders"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="modules/games"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="modules/finances"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="modules/lists"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="modules/wellbeing"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

/* ================================================================
   NAVBAR STYLES
   ================================================================ */

const styles = StyleSheet.create({
  /*
   * Unselected:
   * icon only.
   */

  tab: {
    minWidth: 46,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 23,
  },

  /*
   * Selected:
   * icon + title inside a rounded rectangle.
   */

  selectedTab: {
    minWidth: 96,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 23,
    gap: 7,
  },

  selectedText: {
    color: '#FFFFFF',
    fontFamily:
      'Poppins-SemiBold',
    fontSize: 13,
    lineHeight: 18,
    includeFontPadding: false,
  },
});