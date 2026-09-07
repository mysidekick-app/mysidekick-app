import React from 'react';
import {
  Image,
  ImageSourcePropType,
  StyleSheet,
  View,
} from 'react-native';

type SidekickAvatarProps = {
  sidekickId?: string | null;
  size?: number;
};

const DEFAULT_SIDEKICK: ImageSourcePropType = require('@/assets/sidekick-favicon.png');

const SIDEKICKS: Record<string, ImageSourcePropType> = {
  'sidekick-01': require('@/assets/sidekicks/sidekick-01.png'),
  'sidekick-02': require('@/assets/sidekicks/sidekick-02.png'),
  'sidekick-03': require('@/assets/sidekicks/sidekick-03.png'),
  'sidekick-04': require('@/assets/sidekicks/sidekick-04.png'),
  'sidekick-05': require('@/assets/sidekicks/sidekick-05.png'),
  'sidekick-06': require('@/assets/sidekicks/sidekick-06.png'),
  'sidekick-07': require('@/assets/sidekicks/sidekick-07.png'),
  'sidekick-08': require('@/assets/sidekicks/sidekick-08.png'),
  'sidekick-09': require('@/assets/sidekicks/sidekick-09.png'),
  'sidekick-10': require('@/assets/sidekicks/sidekick-10.png'),
  'sidekick-11': require('@/assets/sidekicks/sidekick-11.png'),
  'sidekick-12': require('@/assets/sidekicks/sidekick-12.png'),
  'sidekick-13': require('@/assets/sidekicks/sidekick-13.png'),
  'sidekick-14': require('@/assets/sidekicks/sidekick-14.png'),
  'sidekick-15': require('@/assets/sidekicks/sidekick-15.png'),
  'sidekick-16': require('@/assets/sidekicks/sidekick-16.png'),
  'sidekick-17': require('@/assets/sidekicks/sidekick-17.png'),
  'sidekick-18': require('@/assets/sidekicks/sidekick-18.png'),
  'sidekick-19': require('@/assets/sidekicks/sidekick-19.png'),
  'sidekick-20': require('@/assets/sidekicks/sidekick-20.png'),
  'sidekick-21': require('@/assets/sidekicks/sidekick-21.png'),
  'sidekick-22': require('@/assets/sidekicks/sidekick-22.png'),
  'sidekick-23': require('@/assets/sidekicks/sidekick-23.png'),
  'sidekick-24': require('@/assets/sidekicks/sidekick-24.png'),
  'sidekick-25': require('@/assets/sidekicks/sidekick-25.png'),
  'sidekick-26': require('@/assets/sidekicks/sidekick-26.png'),
  'sidekick-27': require('@/assets/sidekicks/sidekick-27.png'),
  'sidekick-28': require('@/assets/sidekicks/sidekick-28.png'),
  'sidekick-29': require('@/assets/sidekicks/sidekick-29.png'),
  'sidekick-30': require('@/assets/sidekicks/sidekick-30.png'),
  'sidekick-31': require('@/assets/sidekicks/sidekick-31.png'),
  'sidekick-32': require('@/assets/sidekicks/sidekick-32.png'),
  'sidekick-33': require('@/assets/sidekicks/sidekick-33.png'),
  'sidekick-34': require('@/assets/sidekicks/sidekick-34.png'),
  'sidekick-35': require('@/assets/sidekicks/sidekick-35.png'),
  'sidekick-36': require('@/assets/sidekicks/sidekick-36.png'),
  'sidekick-37': require('@/assets/sidekicks/sidekick-37.png'),
  'sidekick-38': require('@/assets/sidekicks/sidekick-38.png'),
  'sidekick-39': require('@/assets/sidekicks/sidekick-39.png'),
  'sidekick-40': require('@/assets/sidekicks/sidekick-40.png'),
  'sidekick-41': require('@/assets/sidekicks/sidekick-41.png'),
  'sidekick-42': require('@/assets/sidekicks/sidekick-42.png'),
  'sidekick-43': require('@/assets/sidekicks/sidekick-43.png'),
  'sidekick-44': require('@/assets/sidekicks/sidekick-44.png'),
  'sidekick-45': require('@/assets/sidekicks/sidekick-45.png'),
  'sidekick-46': require('@/assets/sidekicks/sidekick-46.png'),
  'sidekick-47': require('@/assets/sidekicks/sidekick-47.png'),
  'sidekick-48': require('@/assets/sidekicks/sidekick-48.png'),
};

export function getSidekickImage(
  sidekickId?: string | null
): ImageSourcePropType {
  // New users with no selected Sidekick use the default favicon image.
  if (!sidekickId) {
    return DEFAULT_SIDEKICK;
  }

  // If a valid Sidekick has been selected, use that Sidekick.
  return SIDEKICKS[sidekickId] ?? DEFAULT_SIDEKICK;
}

export default function SidekickAvatar({
  sidekickId,
  size = 72,
}: SidekickAvatarProps) {
  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Image
        source={getSidekickImage(sidekickId)}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
        }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});