import { Tabs } from 'expo-router';
import {Home, MessageCircle, User } from 'lucide-react-native';

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

        tabBarActiveTintColor:
          accentForeground,

        tabBarInactiveTintColor:
          isDark
            ? '#8C8982'
            : '#A4A09A',

        tabBarStyle: {
          backgroundColor:
            isDark
              ? '#111111'
              : '#FFFFFF',

          borderTopColor:
            isDark
              ? '#292929'
              : '#ECE9E4',

          height: 60,

          paddingBottom: 8,

          paddingTop: 6,
        },

        tabBarLabelStyle: {
          fontFamily: 'Poppins_500Medium',
          fontSize: 11,
        },
      }}
    >
<Tabs.Screen
  name="index"
  options={{
    title: 'Chat',
    tabBarIcon: ({
      color,
      size,
    }) => (
      <MessageCircle
        color={color}
        size={size || 22}
      />
    ),
  }}
/>

<Tabs.Screen
  name="modules"
  options={{
    title: 'Home',
    tabBarIcon: ({
      color,
      size,
    }) => (
      <Home
        color={color}
        size={size || 22}
      />
    ),
  }}
/>

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',

          tabBarIcon: ({
            color,
            size,
          }) => (
            <User
              color={color}
              size={size || 22}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="bookmarks"
        options={{ href: null }}
      />

      <Tabs.Screen
        name="chat"
        options={{ href: null }}
      />

      <Tabs.Screen
        name="habits"
        options={{ href: null }}
      />

      <Tabs.Screen
        name="plants"
        options={{ href: null }}
      />

      <Tabs.Screen
        name="planner"
        options={{ href: null }}
      />

      <Tabs.Screen
        name="reminders"
        options={{ href: null }}
      />

      <Tabs.Screen
        name="settings"
        options={{ href: null }}
      />

      <Tabs.Screen
        name="modules/games"
        options={{ href: null }}
      />

      <Tabs.Screen
        name="modules/finances"
        options={{ href: null }}
      />

      <Tabs.Screen
        name="modules/lists"
        options={{ href: null }}
      />

      <Tabs.Screen
        name="modules/wellbeing"
        options={{ href: null }}
      />
    </Tabs>
  );
}
