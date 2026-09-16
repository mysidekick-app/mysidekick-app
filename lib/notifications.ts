import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const PUSH_TOKEN_CACHE_PREFIX = 'mysidekick:push-token:';
const PUSH_TOKEN_CACHE_VERSION = '1';

type CachedPushToken = {
  token: string;
  userId: string;
  platform: string;
  savedAt: string;
  version: string;
};

function getPushTokenCacheKey(
  userId: string,
): string {
  return `${PUSH_TOKEN_CACHE_PREFIX}${userId}:${Platform.OS}`;
}

async function getCachedPushToken(
  userId: string,
): Promise<string | null> {
  if (!userId) {
    return null;
  }

  try {
    const key = getPushTokenCacheKey(userId);
    const cached = await AsyncStorage.getItem(key);

    if (!cached) {
      return null;
    }

    const parsed =
      JSON.parse(cached) as CachedPushToken;

    if (
      parsed.version !== PUSH_TOKEN_CACHE_VERSION ||
      parsed.userId !== userId ||
      parsed.platform !== Platform.OS ||
      !parsed.token
    ) {
      await AsyncStorage.removeItem(key);
      return null;
    }

    return parsed.token;
  } catch (error) {
    console.error(
      'Could not read cached push token:',
      error,
    );

    return null;
  }
}

async function cachePushToken(
  userId: string,
  token: string,
): Promise<void> {
  if (!userId || !token) {
    return;
  }

  try {
    const cached: CachedPushToken = {
      token,
      userId,
      platform: Platform.OS,
      savedAt: new Date().toISOString(),
      version: PUSH_TOKEN_CACHE_VERSION,
    };

    await AsyncStorage.setItem(
      getPushTokenCacheKey(userId),
      JSON.stringify(cached),
    );
  } catch (error) {
    console.error(
      'Could not cache push token:',
      error,
    );
  }
}

export async function clearCachedPushToken(
  userId: string,
): Promise<void> {
  if (!userId) {
    return;
  }

  try {
    await AsyncStorage.removeItem(
      getPushTokenCacheKey(userId),
    );
  } catch (error) {
    console.error(
      'Could not clear cached push token:',
      error,
    );
  }
}

export async function registerForPushNotificationsAsync(
  userId?: string,
): Promise<string | null> {
  if (!Device.isDevice) {
    console.log(
      'Push notifications require a physical device.',
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
      },
    );
  }

  const { status: existingStatus } =
    await Notifications.getPermissionsAsync();

  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } =
      await Notifications.requestPermissionsAsync();

    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log(
      'Notification permission was not granted.',
    );
    return null;
  }

  /*
   * If we already have a cached token for this
   * signed-in user and device, use it.
   */
  if (userId) {
    const cachedToken =
      await getCachedPushToken(userId);

    if (cachedToken) {
      console.log(
        'Using cached Expo Push Token:',
        cachedToken,
      );

      return cachedToken;
    }
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    console.log(
      'Expo EAS project ID could not be found.',
    );
    return null;
  }

  try {
    const token = (
      await Notifications.getExpoPushTokenAsync({
        projectId,
      })
    ).data;

    console.log(
      'Expo Push Token:',
      token,
    );

    if (userId) {
      await cachePushToken(
        userId,
        token,
      );
    }

    return token;
  } catch (error) {
    console.error(
      'Could not get Expo push token:',
      error,
    );

    return null;
  }
}