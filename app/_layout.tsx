import { useEffect } from 'react';

import {
  Stack,
  useRouter,
  useSegments,
} from 'expo-router';

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import {
  AppProvider,
  useApp,
} from '../components/AppProvider';

import {
  AuthProvider,
  useAuth,
} from '../components/AuthProvider';

function AppShell() {
  const { isDark } = useApp();

  return (
    <>
      <StatusBar
        style={isDark ? 'light' : 'dark'}
      />
      <AuthGate />
    </>
  );
}

function AuthGate() {
  const { session, loading } = useAuth();

  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return;
    }

    const inAuth =
      segments[0] === '(auth)';

    if (!session && !inAuth) {
      router.replace('/login');
      return;
    }

    if (session && inAuth) {
      router.replace(
        '/(tabs)/modules',
      );
    }
  }, [
    session,
    loading,
    segments,
    router,
  ]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppProvider>
          <AppShell />
        </AppProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}