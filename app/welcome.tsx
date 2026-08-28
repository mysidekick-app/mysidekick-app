import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

const CHARCOAL = '#242424';
const WORD = 'sidekick';

const SIDEKICK_IMAGE = require('../assets/Sidekick.png');

export default function WelcomeScreen() {
  const { width, height } = useWindowDimensions();

  const characterOpacity = useRef(new Animated.Value(0)).current;
  const characterScale = useRef(new Animated.Value(0.88)).current;

  const letterAnimations = useRef(
    WORD.split('').map(() => new Animated.Value(0))
  ).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(characterOpacity, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),

      Animated.spring(characterScale, {
        toValue: 1,
        tension: 55,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    const animations = letterAnimations.map((animation, index) =>
      Animated.timing(animation, {
        toValue: 1,
        duration: 520,
        delay: 350 + index * 90,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    );

    Animated.stagger(55, animations).start();
  }, [characterOpacity, characterScale, letterAnimations]);

  const isDesktop = width >= 768;
  const isSmallPhone = height < 700;

  /*
   * Responsive character size.
   *
   * Phones:
   *   roughly 160–210px
   *
   * Tablets / desktop:
   *   scales up but never becomes enormous.
   */
  const circleSize = isDesktop
    ? Math.min(width * 0.22, 230)
    : Math.min(width * 0.52, 210);

  const topSpacing = isSmallPhone
    ? height * 0.07
    : isDesktop
      ? height * 0.11
      : height * 0.10;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View
          style={[
            styles.content,
            isDesktop && styles.desktopContent,
          ]}
        >
          {/* -------------------------------------------------------- */}
          {/* CHARACTER + WORDMARK                                     */}
          {/* -------------------------------------------------------- */}

          <View
            style={[
              styles.brandArea,
              {
                paddingTop: topSpacing,
              },
            ]}
          >
            <Animated.View
              style={[
                styles.characterCircle,
                {
                  width: circleSize,
                  height: circleSize,
                  borderRadius: circleSize / 2,
                  opacity: characterOpacity,
                  transform: [
                    {
                      scale: characterScale,
                    },
                  ],
                },
              ]}
            >
              <Image
                source={SIDEKICK_IMAGE}
                resizeMode="contain"
                style={{
                  width: circleSize,
                  height: circleSize,
                }}
              />
            </Animated.View>

            {/* ------------------------------------------------------ */}
            {/* SIDEKICK WORDMARK                                      */}
            {/* ------------------------------------------------------ */}

            <View style={styles.wordmark}>
              {WORD.split('').map((letter, index) => {
                const animation = letterAnimations[index];

                /*
                 * Each letter starts slightly to the side and above/
                 * below its final position, giving the word a subtle
                 * slithering motion as it forms.
                 */
                const translateX = animation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [
                    index % 2 === 0 ? -30 : 30,
                    0,
                  ],
                });

                const translateY = animation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [
                    index % 2 === 0 ? 16 : -16,
                    0,
                  ],
                });

                const rotate = animation.interpolate({
                  inputRange: [0, 0.6, 1],
                  outputRange: [
                    index % 2 === 0 ? '-14deg' : '14deg',
                    index % 2 === 0 ? '7deg' : '-7deg',
                    '0deg',
                  ],
                });

                const scale = animation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.72, 1],
                });

                return (
                  <Animated.Text
                    key={`${letter}-${index}`}
                    style={[
                      styles.wordmarkLetter,
                      {
                        opacity: animation,
                        transform: [
                          { translateX },
                          { translateY },
                          { rotate },
                          { scale },
                        ],
                      },
                    ]}
                  >
                    {letter}
                  </Animated.Text>
                );
              })}
            </View>
          </View>

          {/* -------------------------------------------------------- */}
          {/* LOGIN / SIGNUP                                           */}
          {/* -------------------------------------------------------- */}

          <View style={styles.actions}>
            <View
              style={[
                styles.actionInner,
                isDesktop && styles.desktopActionInner,
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Log in"
                onPress={() => router.push('/login')}
                style={({ pressed }) => [
                  styles.loginButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.loginButtonText}>
                  LOGIN
                </Text>
              </Pressable>

              <View style={styles.signupRow}>
                <Text style={styles.newHereText}>
                  New here?
                </Text>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sign up"
                  onPress={() => router.push('/signup')}
                  hitSlop={10}
                >
                  <Text style={styles.signupText}>
                    Sign up
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },

  safeArea: {
    flex: 1,
  },

  content: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
  },

  desktopContent: {
    maxWidth: 760,
  },

  brandArea: {
    flex: 1,
    alignItems: 'center',
  },

  characterCircle: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },

  wordmarkLetter: {
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
    fontSize: 34,
    lineHeight: 42,
    letterSpacing: -1.2,
  },

  actions: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 38,
  },

  actionInner: {
    width: '88%',
    maxWidth: 430,
    alignItems: 'center',
  },

  desktopActionInner: {
    width: '72%',
    maxWidth: 430,
  },

  loginButton: {
    width: '100%',
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: CHARCOAL,
    alignItems: 'center',
    justifyContent: 'center',
  },

  buttonPressed: {
    opacity: 0.78,
    transform: [
      {
        scale: 0.985,
      },
    ],
  },

  loginButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
    fontSize: 15,
    letterSpacing: 1.2,
  },

  signupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    gap: 5,
  },

  newHereText: {
    color: '#FFFFFF',
    opacity: 0.72,
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
  },

  signupText: {
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
    fontSize: 13,
  },
});