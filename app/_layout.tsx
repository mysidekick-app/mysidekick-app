import { useEffect, useRef, useState } from 'react';

import {
  Alert,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

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
/* PUSH NOTIFICATIONS                                                         */
/* -------------------------------------------------------------------------- */

async function registerForPushNotificationsAsync(): Promise<
  string | null
> {
  if (!Device.isDevice) {
    console.log(
      'Push notifications require a physical device.'
    );
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(
      'default',
      {
        name: 'My Sidekick',
        importance:
          Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
        lockscreenVisibility:
          Notifications.AndroidNotificationVisibility.PUBLIC,
      }
    );
  }

  const {
    status: existingStatus,
  } = await Notifications.getPermissionsAsync();

  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } =
      await Notifications.requestPermissionsAsync();

    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log(
      'Notification permission was not granted.'
    );

    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    console.log(
      'Expo EAS project ID could not be found.'
    );

    return null;
  }

  try {
    const token =
      (
        await Notifications.getExpoPushTokenAsync({
          projectId,
        })
      ).data;

    console.log(
      'EXPO PUSH TOKEN:',
      token
    );

    return token;
  } catch (error) {
    console.error(
      'Could not get Expo push token:',
      error
    );

    return null;
  }
}

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
  const { session, loading } = useAuth();
  const { isDark } = useApp();

  const router = useRouter();
  const segments = useSegments();

  const [animationFinished, setAnimationFinished] =
    useState(false);

  const [showLoadingScreen, setShowLoadingScreen] =
    useState(true);

  const notificationRegistered =
    useRef(false);

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
  /* PUSH NOTIFICATION REGISTRATION                                           */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (
      loading ||
      showLoadingScreen ||
      !session ||
      notificationRegistered.current
    ) {
      return;
    }

    notificationRegistered.current = true;

    const register = async () => {
      const token =
        await registerForPushNotificationsAsync();

      if (token) {
        /*
         * TEMPORARY TEST:
         * Show the Expo push token directly on the
         * friend's iPhone so we don't need the console.
         */
        Alert.alert(
          'Push Notifications Ready',
          `My Sidekick successfully registered this device for push notifications.\n\nExpo Push Token:\n\n${token}`,
          [
            {
              text: 'OK',
            },
          ]
        );
      } else {
        Alert.alert(
          'Push Notifications',
          'My Sidekick could not register this device for push notifications. We need to check the notification permission or EAS configuration.'
        );
      }
    };

    register();
  }, [
    loading,
    showLoadingScreen,
    session,
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