import React from 'react';
import { Tabs } from 'expo-router';
import {
  Home,
  MessageCircle,
  User,
} from 'lucide-react-native';
import { View, StyleSheet } from 'react-native';

import { useApp } from '@/components/AppProvider';

export default function TabsLayout() {
  const {
    accentForeground,
    isDark,
  } = useApp();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        /*
         * We are handling the selected/unselected appearance
         * ourselves inside tabBarIcon, so the native tint
         * colors are kept neutral.
         */
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: isDark
          ? '#8C8982'
          : '#A4A09A',

        tabBarStyle: {
          backgroundColor: isDark
            ? '#111111'
            : '#FFFFFF',

          borderTopColor: isDark
            ? '#292929'
            : '#ECE9E4',

          height: 64,
          paddingBottom: 8,
          paddingTop: 7,
        },

        /*
         * Hide all tab titles.
         * The navigation is now icon-only.
         */
        tabBarShowLabel: false,

        tabBarLabelStyle: {
          display: 'none',
        },
      }}
    >
      {/* =====================================================
          CHAT
         ===================================================== */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chat',

          tabBarIcon: ({
            focused,
          }) => (
            <View
              style={[
                styles.iconWrapper,
                focused && [
                  styles.selectedIconWrapper,
                  {
                    backgroundColor:
                      accentForeground,
                  },
                ],
              ]}
            >
              <MessageCircle
                color={
                  focused
                    ? '#FFFFFF'
                    : isDark
                    ? '#8C8982'
                    : '#A4A09A'
                }
                size={focused ? 25 : 22}
                strokeWidth={focused ? 2.3 : 2}
              />
            </View>
          ),
        }}
      />

      {/* =====================================================
          HOME
         ===================================================== */}
      <Tabs.Screen
        name="modules"
        options={{
          title: 'Home',

          tabBarIcon: ({
            focused,
          }) => (
            <View
              style={[
                styles.iconWrapper,
                focused && [
                  styles.selectedIconWrapper,
                  {
                    backgroundColor:
                      accentForeground,
                  },
                ],
              ]}
            >
              <Home
                color={
                  focused
                    ? '#FFFFFF'
                    : isDark
                    ? '#8C8982'
                    : '#A4A09A'
                }
                size={focused ? 25 : 22}
                strokeWidth={focused ? 2.3 : 2}
              />
            </View>
          ),
        }}
      />

      {/* =====================================================
          PROFILE
         ===================================================== */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',

          tabBarIcon: ({
            focused,
          }) => (
            <View
              style={[
                styles.iconWrapper,
                focused && [
                  styles.selectedIconWrapper,
                  {
                    backgroundColor:
                      accentForeground,
                  },
                ],
              ]}
            >
              <User
                color={
                  focused
                    ? '#FFFFFF'
                    : isDark
                    ? '#8C8982'
                    : '#A4A09A'
                }
                size={focused ? 25 : 22}
                strokeWidth={focused ? 2.3 : 2}
              />
            </View>
          ),
        }}
      />

      {/* =====================================================
          HIDDEN ROUTES
          Functionality unchanged
         ===================================================== */}

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

const styles = StyleSheet.create({
  /*
   * Normal icon:
   * No background.
   * Slightly smaller.
   */
  iconWrapper: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
  },

  /*
   * Selected icon:
   * Circular accent background.
   * The icon itself becomes white.
   *
   * Because the selected icon is physically inside
   * a larger circle, it also appears slightly larger
   * than the unselected icons.
   */
  selectedIconWrapper: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',

    transform: [
      {
        scale: 1.08,
      },
    ],
  },
});