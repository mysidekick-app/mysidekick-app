import { useEffect, useRef, useState } from 'react';

import {
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';

import { useFonts } from '@expo-google-fonts/poppins';

import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';

import { AppProvider, useApp } from '@/components/AppProvider';

import {
  AuthProvider,
  useAuth,
} from '@/components/AuthProvider';

import { useFrameworkReady } from '@/hooks/useFrameworkReady';

import LottieView from 'lottie-react-native';

SplashScreen.preventAutoHideAsync();

const loadingAnimation = require('../assets/loading.json');

/* -------------------------------------------------------------------------- */
/* NOTIFICATION HANDLER                                                       */
/* -------------------------------------------------------------------------- */

import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/* -------------------------------------------------------------------------- */
/* LOADING SCREEN                                                             */
/* -------------------------------------------------------------------------- */

function LoadingScreen({
  onFinished,
}: {
  onFinished: () => void;
}) {
  const { width } = useWindowDimensions();

  const animationWidth = width;

  const animationHeight =
    width * (1920 / 1200);

  return (
    <View style={styles.loadingOverlay}>
      <LottieView
        source={loadingAnimation}
        autoPlay
        loop={false}
        onAnimationFinish={onFinished}
        style={{
          width: animationWidth,
          height: animationHeight,
        }}
        resizeMode="contain"
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* ROOT NAVIGATOR                                                             */
/* -------------------------------------------------------------------------- */

function RootNavigator() {
  const { session, loading } = useAuth();
  const { isDark } = useApp();

  const router = useRouter();
  const segments = useSegments();

  const [animationFinished, setAnimationFinished] =
    useState(false);

  const [showLoadingScreen, setShowLoadingScreen] =
    useState(true);

  const fadeAnim = useRef(
    new Animated.Value(1)
  ).current;

  const appBackground = isDark
    ? '#000000'
    : '#FFFFFF';

  /* ------------------------------------------------------------------------ */
  /* NATIVE / ROOT BACKGROUND                                                 */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(
      appBackground
    ).catch(() => {
      // Ignore unsupported/native background errors.
    });
  }, [appBackground]);

  /* ------------------------------------------------------------------------ */
  /* LOADING SCREEN FADE                                                      */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (
      loading ||
      !animationFinished ||
      !showLoadingScreen
    ) {
      return;
    }

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 350,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      setShowLoadingScreen(false);
    });
  }, [
    loading,
    animationFinished,
    showLoadingScreen,
    fadeAnim,
  ]);

  /* ------------------------------------------------------------------------ */
  /* AUTH / NAVIGATION                                                        */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (
      loading ||
      showLoadingScreen
    ) {
      return;
    }

    const firstSegment = segments[0];
    const secondSegment = segments[1];

    const onWelcome =
      firstSegment === 'welcome';

    const onAuth =
      firstSegment === '(auth)';

    const onLogin =
      onAuth &&
      secondSegment === 'login';

    const onSignup =
      onAuth &&
      secondSegment === 'signup';

    if (session) {
      if (
        onWelcome ||
        onLogin ||
        onSignup
      ) {
        router.replace('/modules' as never);
      }

      return;
    }

    if (!session) {
      if (
        onWelcome ||
        onLogin ||
        onSignup
      ) {
        return;
      }

      router.replace('/welcome');
    }
  }, [
    session,
    loading,
    showLoadingScreen,
    segments,
    router,
  ]);

  /* ------------------------------------------------------------------------ */
  /* NAVIGATION UI                                                            */
  /* ------------------------------------------------------------------------ */

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor:
              appBackground,
          },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="+not-found" />
      </Stack>

      {showLoadingScreen && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: fadeAnim,
            },
          ]}
        >
          <LoadingScreen
            onFinished={() =>
              setAnimationFinished(true)
            }
          />
        </Animated.View>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* ROOT LAYOUT                                                                */
/* -------------------------------------------------------------------------- */

export default function RootLayout() {
  useFrameworkReady();

  const [
    fontsLoaded,
    fontError,
  ] = useFonts({
    'Poppins-Regular':
      Poppins_400Regular,

    'Poppins-Medium':
      Poppins_500Medium,

    'Poppins-SemiBold':
      Poppins_600SemiBold,

    'Poppins-Bold':
      Poppins_700Bold,

    'Poppins-ExtraBold':
      Poppins_800ExtraBold,
  });

  useEffect(() => {
    if (
      fontsLoaded ||
      fontError
    ) {
      SplashScreen.hideAsync();
    }
  }, [
    fontsLoaded,
    fontError,
  ]);

  if (
    !fontsLoaded &&
    !fontError
  ) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppProvider>
          <RootNavigator />

          <StatusBar
            style="auto"
          />
        </AppProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

/* -------------------------------------------------------------------------- */
/* STYLES                                                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  loadingOverlay: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});