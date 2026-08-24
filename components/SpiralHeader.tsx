import { View, StyleSheet, useWindowDimensions, Image } from 'react-native';
import { useApp } from '@/components/AppProvider';

const TILE_WIDTH = 97;
const TILE_HEIGHT = 44;

const SPIRAL_BASE64 = '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';

export function SpiralHeader() {
  const { width: screenWidth } = useWindowDimensions();
  const { isDark } = useApp();
  const count = Math.ceil(screenWidth / TILE_WIDTH) + 1;
  const tintColor = isDark ? '#FFFFFF' : '#000000';

  return (
    <View style={styles.container} accessibilityLabel="Decorative spiral header">
      <View style={styles.row}>
        {Array.from({ length: count }).map((_, index) => (
          <Image
            key={index}
            source={{ uri: `data:image/png;base64,${SPIRAL_BASE64}` }}
            style={[styles.tile, { tintColor }]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: TILE_HEIGHT, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  tile: { width: TILE_WIDTH, height: TILE_HEIGHT },
});
