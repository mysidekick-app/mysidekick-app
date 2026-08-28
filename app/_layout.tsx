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

import { useFonts } from 'expo-font';

import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';

import { AppProvider } from '@/components/AppProvider';

import {
  AuthProvider,
  useAuth,
} from '@/components/AuthProvider';

import { useFrameworkReady } from '@/hooks/useFrameworkReady';

import LottieView from 'lottie-react-native';

SplashScreen.preventAutoHideAsync();

const loadingAnimation =
  require('../assets/loading.json');

function LoadingScreen({
  onFinished,
}: {
  onFinished: () => void;
}) {
  const { width, height } = useWindowDimensions();

  const animationSize = Math.min(
    width * 0.72,
    height * 0.55,
    420
  );

  return (
    <View style={styles.loadingOverlay}>
      <LottieView
        source={loadingAnimation}
        autoPlay
        loop={false}
        onAnimationFinish={onFinished}
        style={{
          width: animationSize,
          height: animationSize,
        }}
      />
    </View>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();

  const router = useRouter();

  const segments = useSegments();

  const [animationFinished, setAnimationFinished] =
    useState(false);

  const [showLoadingScreen, setShowLoadingScreen] =
    useState(true);

  const fadeAnim = useRef(
    new Animated.Value(1)
  ).current;

  /*
   * When authentication has finished loading and
   * the Lottie animation has finished, fade out
   * the custom loading screen.
   */
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

  /*
   * Decide where the user should go after the
   * loading screen has finished.
   */
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

    /*
     * LOGGED-IN USER
     *
     * If they are already authenticated and
     * somehow arrive at Welcome/Login/Signup,
     * send them into the app.
     */
    if (session) {
      if (
        onWelcome ||
        onLogin ||
        onSignup
      ) {
        router.replace('/(tabs)');
      }

      return;
    }

    /*
     * LOGGED-OUT USER
     *
     * Welcome, login and signup are public.
     */
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

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
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
            style="dark"
          />
        </AppProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingOverlay: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});