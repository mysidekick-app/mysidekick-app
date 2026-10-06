import { useEffect, useRef, useState } from 'react';

import {
  Animated,
  Easing,
  Platform,
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

import * as Notifications from 'expo-notifications';

import {
  configureRevenueCat,
  hasPremiumAccess,
  presentPremiumPaywall,
} from '@/lib/revenuecat';

SplashScreen.preventAutoHideAsync();

const loadingAnimation = require('../assets/loading.json');

/* -------------------------------------------------------------------------- */
/* NOTIFICATION HANDLER                                                       */
/* -------------------------------------------------------------------------- */

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
  const { session, loading, initializing } = useAuth();

  const { isDark } = useApp();

  const router = useRouter();

  const segments = useSegments();

  /*
   * IMPORTANT:
   *
   * This starts FALSE.
   *
   * Previously this was TRUE, which meant every app refresh/open displayed
   * the loading animation even when the user already had a valid session.
   */
  const [showLoadingScreen, setShowLoadingScreen] =
    useState(false);

  const [animationFinished, setAnimationFinished] =
    useState(false);

  const [checkingPremium, setCheckingPremium] =
    useState(false);

  const [premiumChecked, setPremiumChecked] =
    useState(false);

  const [paywallShowing, setPaywallShowing] =
    useState(false);

  const fadeAnim = useRef(
    new Animated.Value(1),
  ).current;

  const appBackground = isDark
    ? '#000000'
    : '#FFFFFF';

  /* ------------------------------------------------------------------------ */
  /* NATIVE / ROOT BACKGROUND                                                 */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(
      appBackground,
    ).catch(() => {
      // Ignore unsupported/native background errors.
    });
  }, [appBackground]);

  /* ------------------------------------------------------------------------ */
  /* ACTUAL AUTH ACTION → SHOW LOADING SCREEN                                */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    /*
     * `loading` now represents an actual authentication action:
     *
     * - Sign in
     * - Sign up
     * - Sign out
     *
     * It does NOT represent restoring an existing session.
     */
    if (loading) {
      setAnimationFinished(false);
      setShowLoadingScreen(true);

      fadeAnim.setValue(1);

      return;
    }

    /*
     * When the actual authentication action finishes, fade the loading
     * animation away.
     */
    if (
      !loading &&
      showLoadingScreen &&
      animationFinished
    ) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 350,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        setShowLoadingScreen(false);
        fadeAnim.setValue(1);
      });
    }
  }, [
    loading,
    animationFinished,
    showLoadingScreen,
    fadeAnim,
  ]);

  /* ------------------------------------------------------------------------ */
  /* RESET PREMIUM STATE WHEN USER CHANGES                                   */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    setCheckingPremium(false);
    setPremiumChecked(false);
    setPaywallShowing(false);
  }, [session?.user?.id]);

  /* ------------------------------------------------------------------------ */
  /* REVENUECAT SUBSCRIPTION CHECK                                           */
  /*                                                                          */
  /* iOS + Android: RevenueCat controls access                               */
  /* Web: RevenueCat is bypassed                                              */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    let cancelled = false;

    async function checkPremiumAccess() {
      /*
       * Do not check until authentication has finished.
       *
       * Existing sessions are restored without showing the loading screen.
       */
      if (
        initializing ||
        loading ||
        !session?.user?.id
      ) {
        return;
      }

      /*
       * Prevent duplicate RevenueCat calls.
       */
      if (
        checkingPremium ||
        premiumChecked
      ) {
        return;
      }

      /*
       * RevenueCat is required on native platforms.
       * Web does not use RevenueCat.
       */
      if (
        Platform.OS !== 'ios' &&
        Platform.OS !== 'android'
      ) {
        if (!cancelled) {
          setPremiumChecked(true);
        }

        return;
      }

      setCheckingPremium(true);

      try {
        /*
         * Identify the authenticated Supabase user
         * inside RevenueCat.
         */
        await configureRevenueCat(
          session.user.id,
        );

        if (cancelled) {
          return;
        }

        /*
         * Check whether the user already has the
         * my_sidekick_pro entitlement.
         *
         * This is also TRUE during the 7-day trial.
         */
        const premium =
          await hasPremiumAccess();

        if (cancelled) {
          return;
        }

        /*
         * User has an active subscription or trial.
         * Allow access to the app.
         */
        if (premium) {
          setPremiumChecked(true);
          return;
        }

        /*
         * No active entitlement.
         *
         * Show the RevenueCat paywall.
         */
        setPaywallShowing(true);

        const result =
          await presentPremiumPaywall();

        if (cancelled) {
          return;
        }

        setPaywallShowing(false);

        /*
         * Check RevenueCat again after the paywall.
         *
         * The entitlement remains the source of truth.
         */
        const premiumAfterPaywall =
          result ||
          (await hasPremiumAccess());

        if (cancelled) {
          return;
        }

        if (premiumAfterPaywall) {
          /*
           * Purchase or restore succeeded.
           * Allow the user into the app.
           */
          setPremiumChecked(true);
        } else {
          /*
           * User dismissed the paywall or did not
           * complete the subscription.
           *
           * Keep them outside the main app.
           */
          setPremiumChecked(false);
        }
      } catch (error) {
        console.error(
          'RevenueCat subscription check failed:',
          error,
        );

        if (!cancelled) {
          setPaywallShowing(false);
          setPremiumChecked(false);
        }
      } finally {
        if (!cancelled) {
          setCheckingPremium(false);
        }
      }
    }

    checkPremiumAccess();

    return () => {
      cancelled = true;
    };
  }, [
    session?.user?.id,
    initializing,
    loading,
    checkingPremium,
    premiumChecked,
  ]);

  /* ------------------------------------------------------------------------ */
  /* AUTH / NAVIGATION                                                        */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    /*
     * Never redirect while an actual login/signup/logout action is happening.
     */
    if (initializing || loading) {
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

    const onConfirmEmail =
      firstSegment === 'confirm-email';

    const onForgotPassword =
      firstSegment === 'forgot-password';

    const onResetPassword =
      firstSegment === 'reset-password';

    const onPublicAuthRoute =
      onLogin ||
      onSignup ||
      onConfirmEmail ||
      onForgotPassword ||
      onResetPassword;

    /* ---------------------------------------------------------------------- */
    /* LOGGED OUT                                                             */
    /* ---------------------------------------------------------------------- */

    if (!session) {
      if (
        onWelcome ||
        onPublicAuthRoute
      ) {
        return;
      }

      router.replace('/welcome');

      return;
    }

    /* ---------------------------------------------------------------------- */
    /* LOGGED IN — WAIT FOR REVENUECAT                                        */
    /* ---------------------------------------------------------------------- */

    /*
     * While RevenueCat is checking or displaying
     * the paywall, don't navigate into the app.
     */
    if (
      checkingPremium ||
      paywallShowing
    ) {
      return;
    }

    /*
     * On iOS AND Android, don't enter the app until
     * the entitlement has been checked and access
     * has been granted.
     */
    if (
      (Platform.OS === 'ios' ||
        Platform.OS === 'android') &&
      !premiumChecked
    ) {
      return;
    }

    /* ---------------------------------------------------------------------- */
    /* USER HAS PASSED THE PREMIUM GATE                                      */
    /* ---------------------------------------------------------------------- */

    if (
      onWelcome ||
      onLogin ||
      onSignup
    ) {
      router.replace('/modules' as never);
    }
  }, [
    session,
    initializing,
    loading,
    segments,
    router,
    checkingPremium,
    paywallShowing,
    premiumChecked,
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
      backgroundColor: appBackground,
    },
  }}
>
  <Stack.Screen name="welcome" />
  <Stack.Screen name="(auth)" />
  <Stack.Screen name="(tabs)" />
  <Stack.Screen name="confirm-email" />
  <Stack.Screen name="forgot-password" />
  <Stack.Screen name="reset-password" />
  <Stack.Screen name="support" />
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