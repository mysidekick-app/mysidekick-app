import { Platform } from 'react-native';
import Constants from 'expo-constants';

import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
} from 'react-native-purchases';

import RevenueCatUI from 'react-native-purchases-ui';

/*
 * IMPORTANT:
 *
 * Replace these with the PRODUCTION public SDK keys
 * from your RevenueCat project.
 *
 * Do NOT use the test_WjbsLrqqVoKzxAosodUHGaJYZvB
 * key in the final App Store submission.
 */
const REVENUECAT_IOS_API_KEY =
  'appl_txcSSXctEIiZcQVVIDGdnQWhvTG';

const REVENUECAT_ANDROID_API_KEY =
  'goog_aMQRCFTgjEJaqMwHvYnRtAFxuTp';

const PREMIUM_ENTITLEMENT =
  'my_sidekick_pro';

let configured = false;
let configuredUserId: string | null = null;

// Expo Go cannot use the native RevenueCat store with production API keys.
// Skip RevenueCat native configuration in Expo Go so authentication and
// session-persistence can be tested without the subscription layer interfering.
const isExpoGo = Constants.appOwnership === 'expo';

export async function configureRevenueCat(
  userId: string
) {
  if (isExpoGo) {
    return;
  }

  if (
    Platform.OS !== 'ios' &&
    Platform.OS !== 'android'
  ) {
    return;
  }

  if (!userId) {
    return;
  }

  /*
   * Already configured for this exact user.
   */
  if (
    configured &&
    configuredUserId === userId
  ) {
    return;
  }

  /*
   * If another user was previously configured,
   * log that RevenueCat user out before configuring
   * the new authenticated user.
   */
  if (
    configured &&
    configuredUserId &&
    configuredUserId !== userId
  ) {
    try {
      await Purchases.logOut();
    } catch (error) {
      console.warn(
        'RevenueCat logout before user switch failed:',
        error
      );
    }

    configured = false;
    configuredUserId = null;
  }

  Purchases.setLogLevel(
    LOG_LEVEL.DEBUG
  );

  const apiKey =
    Platform.OS === 'ios'
      ? REVENUECAT_IOS_API_KEY
      : REVENUECAT_ANDROID_API_KEY;

  if (
    !apiKey ||
    apiKey.startsWith('YOUR_')
  ) {
    throw new Error(
      'Production RevenueCat API key has not been configured.'
    );
  }

  await Purchases.configure({
    apiKey,
    appUserID: userId,
  });

  configured = true;
  configuredUserId = userId;
}

export async function getCustomerInfo(): Promise<
  CustomerInfo | null
> {
  if (!configured) {
    return null;
  }

  return Purchases.getCustomerInfo();
}

export async function hasPremiumAccess(): Promise<boolean> {
  // Expo Go has no native store access. Treat the user as premium here so
  // authentication/session flows can be tested without opening a paywall.
  // Real iOS/Android builds still use RevenueCat entitlement checks below.
  if (isExpoGo) {
    return true;
  }

  const customerInfo =
    await getCustomerInfo();

  return Boolean(
    customerInfo?.entitlements.active[
      PREMIUM_ENTITLEMENT
    ]
  );
}

export async function getCurrentOffering(): Promise<
  PurchasesOffering | null
> {
  if (!configured) {
    return null;
  }

  const offerings =
    await Purchases.getOfferings();

  return offerings.current ?? null;
}

export async function presentPremiumPaywall(): Promise<boolean> {
  if (isExpoGo) {
    return false;
  }

  if (
    Platform.OS !== 'ios' &&
    Platform.OS !== 'android'
  ) {
    return false;
  }

  if (!configured) {
    return false;
  }

  const result =
    await RevenueCatUI.presentPaywall();

  return (
    result === 'PURCHASED' ||
    result === 'RESTORED'
  );
}

export async function purchasePremium(): Promise<boolean> {
  if (isExpoGo) {
    return false;
  }

  if (!configured) {
    return false;
  }

  const offering =
    await getCurrentOffering();

  if (!offering) {
    throw new Error(
      'No RevenueCat offering is currently available.'
    );
  }

  /*
   * Prefer the annual package from the current
   * RevenueCat offering.
   */
  const packageToPurchase =
    offering.annual ??
    offering.availablePackages.find(
      (pkg) =>
        pkg.identifier === '$rc_annual'
    );

  if (!packageToPurchase) {
    throw new Error(
      'Annual My Sidekick Premium package was not found.'
    );
  }

  const {
    customerInfo,
  } =
    await Purchases.purchasePackage(
      packageToPurchase
    );

  return Boolean(
    customerInfo.entitlements.active[
      PREMIUM_ENTITLEMENT
    ]
  );
}

export async function restorePurchases(): Promise<boolean> {
  if (isExpoGo) {
    return false;
  }

  if (!configured) {
    return false;
  }

  const customerInfo =
    await Purchases.restorePurchases();

  return Boolean(
    customerInfo.entitlements.active[
      PREMIUM_ENTITLEMENT
    ]
  );
}