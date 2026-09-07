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

  const inactiveColor = isDark ? '#8C8982' : '#A4A09A';
  const navBackground = isDark ? '#111111' : '#FFFFFF';
  const navBorder = isDark ? '#292929' : '#ECE9E4';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        tabBarActiveTintColor: accentForeground,
        tabBarInactiveTintColor: inactiveColor,

        /*
         * Keep the navbar floating.
         *
         * The important part is that we DO NOT change the
         * navigator's layout behavior. This prevents the
         * extra white/black boxes that appeared previously.
         */
        tabBarStyle: {
          position: 'absolute',

          left: 8,
          right: 8,
          bottom: 10,

          height: 58,

          backgroundColor: navBackground,

          borderTopColor: navBorder,
          borderTopWidth: 1,

          borderRadius: 18,

          overflow: 'visible',

          paddingTop: 4,
          paddingBottom: 4,

          elevation: 8,

          shadowOpacity: 0.08,
          shadowRadius: 8,

          shadowOffset: {
            width: 0,
            height: 3,
          },
        },

        tabBarShowLabel: false,

        tabBarLabelStyle: {
          display: 'none',
        },

        tabBarItemStyle: {
          height: 54,

          paddingTop: 0,
          paddingBottom: 0,

          overflow: 'visible',
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

          tabBarIcon: ({ focused }) => (
            <View
              style={[
                styles.iconWrapper,

                focused && [
                  styles.selectedIconWrapper,
                  {
                    backgroundColor: accentForeground,
                  },
                ],
              ]}
            >
              <MessageCircle
                color={focused ? '#FFFFFF' : inactiveColor}
                size={focused ? 24 : 21}
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

          tabBarIcon: ({ focused }) => (
            <View
              style={[
                styles.iconWrapper,

                focused && [
                  styles.selectedIconWrapper,
                  {
                    backgroundColor: accentForeground,
                  },
                ],
              ]}
            >
              <Home
                color={focused ? '#FFFFFF' : inactiveColor}
                size={focused ? 24 : 21}
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

          tabBarIcon: ({ focused }) => (
            <View
              style={[
                styles.iconWrapper,

                focused && [
                  styles.selectedIconWrapper,
                  {
                    backgroundColor: accentForeground,
                  },
                ],
              ]}
            >
              <User
                color={focused ? '#FFFFFF' : inactiveColor}
                size={focused ? 24 : 21}
                strokeWidth={focused ? 2.3 : 2}
              />
            </View>
          ),
        }}
      />

      {/* =====================================================
          HIDDEN ROUTES
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
   * Normal unselected icon
   */
  iconWrapper: {
    width: 34,
    height: 34,

    alignItems: 'center',
    justifyContent: 'center',

    borderRadius: 17,
  },

  /*
   * Selected icon
   *
   * Keeps the raised selected-state appearance from
   * the original navbar.
   */
  selectedIconWrapper: {
    width: 46,
    height: 46,

    borderRadius: 23,

    alignItems: 'center',
    justifyContent: 'center',

    marginTop: -14,

    transform: [
      {
        scale: 1.02,
      },
    ],

    elevation: 5,

    shadowOpacity: 0.14,
    shadowRadius: 5,

    shadowOffset: {
      width: 0,
      height: 2,
    },
  },
});