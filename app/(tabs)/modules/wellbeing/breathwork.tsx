import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ChevronLeft, MoreVertical } from 'lucide-react-native';

import { useApp } from '@/components/AppProvider';

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
  cancelAnimation,
} from 'react-native-reanimated';

const DARK_PALETTE = {
  bg: '#090909',
  card: '#121212',
  cardBorder: '#000000',
  text: '#FFFFFF',
  muted: '#A1A1AA',
  divider: '#262626',
};

const LIGHT_PALETTE = {
  bg: '#FBFAF8',
  card: '#FFFFFF',
  cardBorder: '#000000',
  text: '#000000',
  muted: '#52525B',
  divider: '#E4E4E7',
};

const FONT = 'Poppins-Regular';
const FONT_MEDIUM = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';
const FONT_XB = 'Poppins-ExtraBold';

/* ------------------------------------------------------------------ */
/* Box breathing constants                                             */
/* ------------------------------------------------------------------ */

const PHASE_SECONDS = 4;
const PHASE_MS = PHASE_SECONDS * 1000;
const TICK_MS = 250;

// Rectangle dimensions
const RECT_SIZE = 240;
const RECT_RADIUS = 12;
const DOT_SIZE = 16;
const DOT_OFFSET = DOT_SIZE / 2;

type Phase = 0 | 1 | 2 | 3;

const PHASE_LABELS: string[] = [
  'INHALE',
  'HOLD',
  'EXHALE',
  'HOLD',
];

/* ------------------------------------------------------------------ */
/* Map perimeter progress (0..1) to x,y along the rectangle edges.     */
/* ------------------------------------------------------------------ */

function perimeterToXY(progress: number) {
  'worklet';

  const seg = progress * 4;
  const phase = Math.floor(seg);
  const t = seg - phase;

  let x = 0;
  let y = 0;

  if (phase === 0) {
    // left edge: bottom -> top
    x = 0;
    y = RECT_SIZE * (1 - t);
  } else if (phase === 1) {
    // top edge: left -> right
    x = RECT_SIZE * t;
    y = 0;
  } else if (phase === 2) {
    // right edge: top -> bottom
    x = RECT_SIZE;
    y = RECT_SIZE * t;
  } else {
    // bottom edge: right -> left
    x = RECT_SIZE * (1 - t);
    y = RECT_SIZE;
  }

  return { x, y };
}

/* ================================================================== */
/* Screen                                                             */
/* ================================================================== */

export default function BreathworkScreen() {
  const { isDark, accentForeground, onAccent } = useApp() as any;

  const accent = accentForeground || '#FDE047';
  const pageBg = accent;
  const COLORS = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  const styles = makeStyles(COLORS);

  const trackBorderColor = isDark ? '#FFFFFF' : '#000000';

  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<Phase>(0);
  const [countdown, setCountdown] = useState(PHASE_SECONDS);
  const [cycles, setCycles] = useState(0);

  const [menuOpen, setMenuOpen] = useState(false);

  const openSettings = useCallback(() => {
    setMenuOpen(false);
    router.push('/(tabs)/profile');
  }, []);

  // Shared value 0..1 representing progress along the full perimeter.
  const dotProgress = useSharedValue(0);

  // Track timing in refs so the interval callback stays stable.
  const elapsedInPhaseRef = useRef(0);
  const runningRef = useRef(false);
  const phaseRef = useRef<Phase>(0);

  /* ---------------------------------------------------------------- */
  /* Animate the dot to the start of a given phase.                   */
  /* ---------------------------------------------------------------- */

  const animateToPhaseStart = useCallback(
    (p: Phase) => {
      const startProgress = p / 4;

      dotProgress.value = withTiming(startProgress, {
        duration: 0,
        easing: Easing.linear,
      });
    },
    [dotProgress],
  );

  /* ---------------------------------------------------------------- */
  /* Begin animating the dot across the current phase.                */
  /* ---------------------------------------------------------------- */

  const runPhaseAnimation = useCallback(
    (p: Phase) => {
      const startProgress = p / 4;
      const endProgress = (p + 1) / 4;

      dotProgress.value = withTiming(
        endProgress,
        {
          duration: PHASE_MS,
          easing: Easing.linear,
        },
        finished => {
          if (finished) {
            runOnJS(animateToPhaseStart)(p);
          }
        },
      );

      void startProgress;
    },
    [dotProgress, animateToPhaseStart],
  );

  /* ---------------------------------------------------------------- */
  /* Advance to the next phase.                                      */
  /* ---------------------------------------------------------------- */

  const advancePhase = useCallback(() => {
    setPhase(prev => {
      const next = ((prev + 1) % 4) as Phase;

      phaseRef.current = next;

      if (next === 0) {
        setCycles(c => c + 1);
      }

      setCountdown(PHASE_SECONDS);
      elapsedInPhaseRef.current = 0;

      if (runningRef.current) {
        runPhaseAnimation(next);
      }

      return next;
    });
  }, [runPhaseAnimation]);

  /* ---------------------------------------------------------------- */
  /* Start the session — dot continues from current position.         */
  /* ---------------------------------------------------------------- */

  const start = useCallback(() => {
    if (runningRef.current) return;

    runningRef.current = true;
    setRunning(true);
    elapsedInPhaseRef.current = 0;
    setCountdown(PHASE_SECONDS);

    const currentProgress = dotProgress.value;
    const phaseStart = phaseRef.current / 4;
    const phaseEnd = (phaseRef.current + 1) / 4;

    if (currentProgress >= phaseEnd - 0.001) {
      advancePhase();
      return;
    }

    dotProgress.value = withTiming(
      phaseEnd,
      {
        duration:
          PHASE_MS -
          (currentProgress - phaseStart) * 4 * PHASE_MS,
        easing: Easing.linear,
      },
      finished => {
        if (finished) {
          runOnJS(animateToPhaseStart)(phaseRef.current);
        }
      },
    );
  }, [
    dotProgress,
    advancePhase,
    animateToPhaseStart,
  ]);

  /* ---------------------------------------------------------------- */
  /* Pause the session — dot stays at current position.               */
  /* ---------------------------------------------------------------- */

  const pause = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    cancelAnimation(dotProgress);
  }, [dotProgress]);

  /* ---------------------------------------------------------------- */
  /* Toggle start / pause.                                            */
  /* ---------------------------------------------------------------- */

  const toggle = useCallback(() => {
    if (runningRef.current) {
      pause();
    } else {
      start();
    }
  }, [start, pause]);

  /* ---------------------------------------------------------------- */
  /* Reset the session.                                               */
  /* ---------------------------------------------------------------- */

  const reset = useCallback(() => {
    runningRef.current = false;
    setRunning(false);

    cancelAnimation(dotProgress);

    setPhase(0);
    phaseRef.current = 0;

    setCountdown(PHASE_SECONDS);
    setCycles(0);

    elapsedInPhaseRef.current = 0;

    dotProgress.value = 0;
  }, [dotProgress]);

  /* ---------------------------------------------------------------- */
  /* 250ms tick: drive phase + countdown logic.                       */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!running) return;

    const interval = setInterval(() => {
      if (!runningRef.current) return;

      elapsedInPhaseRef.current += TICK_MS;

      const remainingMs =
        PHASE_MS - elapsedInPhaseRef.current;

      const remainingSeconds = Math.max(
        1,
        Math.ceil(remainingMs / 1000),
      );

      setCountdown(remainingSeconds);

      if (elapsedInPhaseRef.current >= PHASE_MS) {
        advancePhase();
      }
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [running, advancePhase]);

  /* ---------------------------------------------------------------- */
  /* Animated dot style.                                              */
  /* ---------------------------------------------------------------- */

  const dotStyle = useAnimatedStyle(() => {
    const { x, y } = perimeterToXY(dotProgress.value);

    return {
      transform: [
        { translateX: x - DOT_OFFSET },
        { translateY: y - DOT_OFFSET },
      ],
    };
  });

  /* ---------------------------------------------------------------- */
  /* Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: pageBg }]}
      edges={['top', 'bottom']}
    >
      <StatusBar barStyle="dark-content" backgroundColor={pageBg} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: 12 }]}>
        <Pressable
          onPress={() =>
            router.push('/(tabs)/modules/wellbeing')
          }
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressedBtn]}
          hitSlop={12}
          accessibilityLabel="Go back"
        >
          <ChevronLeft
            color="#FFFFFF"
            size={22}
            strokeWidth={2.8}
          />
        </Pressable>

        <Text style={[styles.headerTitle, { color: '#000000' }]}>
          BREATHWORK
        </Text>

        <Pressable
          onPress={() => setMenuOpen(prev => !prev)}
          style={({ pressed }) => [styles.menuBtn, pressed && styles.pressedBtn]}
          hitSlop={12}
          accessibilityLabel="Open settings menu"
        >
          <MoreVertical
            color="#000000"
            size={24}
            strokeWidth={2.5}
          />
        </Pressable>
      </View>

      {menuOpen ? (
        <View style={styles.menuShadeOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setMenuOpen(false)}>
            <View style={styles.menuCardWrapper}>
              <View style={styles.shadowBackdrop} />
              <View style={[styles.menuCardBody, { backgroundColor: COLORS.card }]}>
                <Pressable
                  onPress={openSettings}
                  style={styles.menuItem}
                >
                  <Text style={[styles.menuItemText, { color: COLORS.text }]}>
                    Settings
                  </Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Instruction */}
        <Text style={[styles.instruction, { color: '#000000' }]}>
          Follow the dot. Inhale, hold, exhale, hold.
        </Text>

        {/* Breathing rectangle card container */}
        <View style={styles.cardContainer}>
          <View style={styles.cardShadowBackdrop} />
          <View style={[styles.rectWrapCard, { backgroundColor: COLORS.card, borderColor: '#000000' }]}>
            <View style={styles.rectWrap}>
              <View
                style={[
                  styles.rect,
                  { borderColor: trackBorderColor },
                ]}
              >
                <Animated.View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: accent,
                      borderColor: '#000000',
                      borderWidth: 2,
                    },
                    dotStyle,
                  ]}
                />
              </View>
            </View>

            {/* Phase + countdown */}
            <View style={styles.phaseRow}>
              <Text
                style={[
                  styles.phaseLabel,
                  { color: COLORS.text },
                ]}
              >
                {PHASE_LABELS[phase]}
              </Text>

              <Text style={[styles.countdown, { color: COLORS.text }]}>
                {countdown}
              </Text>
            </View>

            {/* Cycles */}
            <Text style={[styles.cycles, { color: COLORS.muted }]}>
              {cycles}{' '}
              {cycles === 1 ? 'cycle' : 'cycles'} completed
            </Text>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <View style={styles.cardContainer}>
            <View style={styles.cardShadowBackdrop} />
            <Pressable
              onPress={toggle}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: '#000000', borderColor: '#000000' },
                pressed && styles.pressedBtn,
              ]}
              accessibilityLabel={
                running ? 'Pause' : 'Start'
              }
            >
              <Text
                style={[
                  styles.primaryBtnText,
                  { color: '#FFFFFF' },
                ]}
              >
                {running ? 'PAUSE' : 'START'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.cardContainer}>
            <View style={styles.cardShadowBackdrop} />
            <Pressable
              onPress={reset}
              style={({ pressed }) => [
                styles.secondaryBtn,
                { backgroundColor: COLORS.card, borderColor: '#000000' },
                pressed && styles.pressedBtn,
              ]}
              accessibilityLabel="Reset"
            >
              <Text
                style={[
                  styles.secondaryBtnText,
                  { color: COLORS.text },
                ]}
              >
                RESET
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                             */
/* ------------------------------------------------------------------ */

type Palette = typeof DARK_PALETTE;

function makeStyles(C: Palette) {
  return StyleSheet.create({
    safe: {
      flex: 1,
    },

    pressedBtn: {
      transform: [{ translateX: 2 }, { translateY: 2 }],
    },

    /* Header */
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 10,
      zIndex: 100,
    },

    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 8,
      backgroundColor: '#000000',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: '#000000',
    },

    headerTitle: {
      fontFamily: FONT_XB,
      fontSize: 22,
      letterSpacing: 1,
    },

    menuBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },

    menuShadeOverlay: {
      position: 'absolute',
      top: 55,
      right: 20,
      zIndex: 1000,
    },

    menuCardWrapper: {
      position: 'relative',
      width: 170,
    },

    shadowBackdrop: {
      position: 'absolute',
      top: 4,
      left: 4,
      right: -4,
      bottom: -4,
      backgroundColor: '#000000',
      borderRadius: 12,
    },

    menuCardBody: {
      borderRadius: 12,
      paddingVertical: 4,
      borderWidth: 2.5,
      borderColor: '#000000',
    },

    menuItem: {
      paddingVertical: 12,
      paddingHorizontal: 16,
    },

    menuItemText: {
      fontFamily: FONT_BOLD,
      fontSize: 13,
    },

    /* Scroll content */
    scrollContent: {
      flexGrow: 1,
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 100,
    },

    /* Instruction */
    instruction: {
      fontFamily: FONT_BOLD,
      fontSize: 14,
      lineHeight: 22,
      textAlign: 'center',
      maxWidth: 320,
      marginBottom: 16,
    },

    cardContainer: {
      position: 'relative',
      width: '100%',
      maxWidth: 400,
      marginBottom: 16,
    },

    cardShadowBackdrop: {
      position: 'absolute',
      top: 4,
      left: 4,
      right: -4,
      bottom: -4,
      backgroundColor: '#000000',
      borderRadius: 16,
    },

    rectWrapCard: {
      width: '100%',
      borderRadius: 16,
      borderWidth: 3,
      paddingVertical: 24,
      alignItems: 'center',
      gap: 16,
    },

    /* Rectangle wrapper */
    rectWrap: {
      alignItems: 'center',
      justifyContent: 'center',
    },

    rect: {
      width: RECT_SIZE,
      height: RECT_SIZE,
      borderWidth: 3,
      borderRadius: RECT_RADIUS,
      backgroundColor: 'transparent',
    },

    dot: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: DOT_SIZE,
      height: DOT_SIZE,
      borderRadius: DOT_SIZE / 2,
    },

    /* Phase row */
    phaseRow: {
      alignItems: 'center',
      gap: 4,
    },

    phaseLabel: {
      fontFamily: FONT_XB,
      fontSize: 18,
      letterSpacing: 2,
    },

    countdown: {
      fontFamily: FONT_XB,
      fontSize: 40,
      fontVariant: ['tabular-nums'],
    },

    /* Cycles */
    cycles: {
      fontFamily: FONT_BOLD,
      fontSize: 13,
      letterSpacing: 0.4,
    },

    /* Controls */
    controls: {
      width: '100%',
      maxWidth: 400,
      alignItems: 'center',
      gap: 16,
      marginTop: 8,
    },

    primaryBtn: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      borderRadius: 16,
      borderWidth: 3,
    },

    primaryBtnText: {
      fontFamily: FONT_XB,
      fontSize: 15,
      letterSpacing: 1.4,
    },

    secondaryBtn: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      borderRadius: 16,
      borderWidth: 3,
    },

    secondaryBtnText: {
      fontFamily: FONT_XB,
      fontSize: 15,
      letterSpacing: 1.4,
    },
  });
}