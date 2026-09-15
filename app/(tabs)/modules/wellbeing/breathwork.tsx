import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Pressable,
  ScrollView,
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
  card: '#151515',
  cardBorder: '#2A2A2A',
  text: '#F4F2EE',
  muted: '#AAA59D',
  divider: '#262626',
};

const LIGHT_PALETTE = {
  bg: '#FBFAF8',
  card: '#FFFFFF',
  cardBorder: '#ECE9E4',
  text: '#27241F',
  muted: '#8F8A82',
  divider: '#F0EEEA',
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
/*                                                                    */
/* Phase 0 (Inhale):     left edge, bottom -> top                     */
/* Phase 1 (Hold):       top edge, left -> right                      */
/* Phase 2 (Exhale):     right edge, top -> bottom                    */
/* Phase 3 (Hold empty):  bottom edge, right -> left                  */
/*                                                                    */
/* Perimeter is divided into 4 equal segments (one per phase).        */
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
  const { isDark, accentForeground, onAccent } = useApp();

  const accent = accentForeground;
  const COLORS = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  const styles = makeStyles(COLORS);

  /*
   * In dark mode, the breathing elements should be white rather than
   * using the user's accent color.
   */
  const breathingColor = isDark ? '#FFFFFF' : accent;
  const resetColor = isDark ? '#AAA59D' : accent;

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
      style={styles.safe}
      edges={['top', 'bottom']}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: 28 }]}>
        <Pressable
          onPress={() =>
            router.push('/(tabs)/modules/wellbeing')
          }
          style={[
            styles.backBtn,
            { backgroundColor: accent },
          ]}
          hitSlop={12}
          accessibilityLabel="Go back"
        >
          <ChevronLeft
            color="#FFFFFF"
            size={22}
            strokeWidth={2.4}
          />
        </Pressable>

        <Text style={styles.headerTitle}>
          BREATHWORK
        </Text>

        <Pressable
          onPress={() => setMenuOpen(prev => !prev)}
          style={styles.menuBtn}
          hitSlop={12}
          accessibilityLabel="Open settings menu"
        >
          <MoreVertical
            color={COLORS.text}
            size={22}
            strokeWidth={2.3}
          />
        </Pressable>
      </View>

      {menuOpen ? (
        <View
          style={[
            styles.menu,
            {
              backgroundColor: COLORS.card,
              borderColor: COLORS.cardBorder,
            },
          ]}
        >
          <Pressable
            onPress={openSettings}
            style={({ pressed }) => [
              styles.menuItem,
              pressed && styles.menuItemPressed,
            ]}
          >
            <Text style={styles.menuItemText}>
              Settings
            </Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Instruction */}
        <Text style={styles.instruction}>
          Follow the dot. Inhale, hold, exhale, hold.
        </Text>

        {/* Breathing rectangle */}
        <View style={styles.rectWrap}>
          <View
            style={[
              styles.rect,

              /*
               * WHITE in black/dark mode.
               * Accent in light mode.
               */
              { borderColor: breathingColor },
            ]}
          >
            <Animated.View
              style={[
                styles.dot,

                /*
                 * WHITE in black/dark mode.
                 * Accent in light mode.
                 */
                {
                  backgroundColor: breathingColor,
                  shadowColor: breathingColor,
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

              /*
               * INHALE / HOLD / EXHALE are WHITE
               * in black/dark mode.
               */
              { color: breathingColor },
            ]}
          >
            {PHASE_LABELS[phase]}
          </Text>

          <Text style={styles.countdown}>
            {countdown}
          </Text>
        </View>

        {/* Cycles */}
        <Text style={styles.cycles}>
          {cycles}{' '}
          {cycles === 1 ? 'cycle' : 'cycles'} completed
        </Text>

        {/* Controls */}
        <View style={styles.controls}>
          <Pressable
            onPress={toggle}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: accent },
              pressed && styles.primaryBtnPressed,
            ]}
            accessibilityLabel={
              running ? 'Pause' : 'Start'
            }
          >
            <Text
              style={[
                styles.primaryBtnText,
                { color: onAccent },
              ]}
            >
              {running ? 'PAUSE' : 'START'}
            </Text>
          </Pressable>

          <Pressable
            onPress={reset}
            style={({ pressed }) => [
              styles.secondaryBtn,
              pressed && styles.secondaryBtnPressed,
            ]}
            accessibilityLabel="Reset"
          >
            <Text
              style={[
                styles.secondaryBtnText,

                /*
                 * RESET is LIGHT GREY in dark mode,
                 * accent in light mode.
                 */
                { color: resetColor },
              ]}
            >
              RESET
            </Text>
          </Pressable>
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
      backgroundColor: C.bg,
    },

    /* Header */
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 28,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: C.divider,
    },

    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },

    headerTitle: {
      fontFamily: FONT_XB,
      fontSize: 16,
      letterSpacing: 1.4,
      color: C.text,
    },

    menuBtn: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
    },

    menu: {
      position: 'absolute',
      top: 76,
      right: 14,
      minWidth: 150,
      borderWidth: 1,
      borderRadius: 14,
      paddingVertical: 6,
      zIndex: 1000,
      elevation: 8,
      shadowOffset: {
        width: 0,
        height: 4,
      },
      shadowOpacity: 0.18,
      shadowRadius: 10,
    },

    menuItem: {
      paddingHorizontal: 16,
      paddingVertical: 12,
    },

    menuItemPressed: {
      opacity: 0.6,
    },

    menuItemText: {
      fontFamily: FONT_MEDIUM,
      fontSize: 13.5,
      color: C.text,
    },

    /* Scroll content */
    scrollContent: {
      flexGrow: 1,
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingTop: 28,
      paddingBottom: 48,
      gap: 16,
    },

    /* Instruction */
    instruction: {
      fontFamily: FONT_MEDIUM,
      fontSize: 14.5,
      lineHeight: 22,
      color: C.muted,
      textAlign: 'center',
      maxWidth: 320,
    },

    /* Rectangle wrapper */
    rectWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },

    rect: {
      width: RECT_SIZE,
      height: RECT_SIZE,
      borderWidth: 2,
      borderRadius: RECT_RADIUS,
    },

    dot: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: DOT_SIZE,
      height: DOT_SIZE,
      borderRadius: DOT_SIZE / 2,
      shadowOpacity: 0.7,
      shadowRadius: 10,
      shadowOffset: {
        width: 0,
        height: 0,
      },
      elevation: 6,
    },

    /* Phase row */
    phaseRow: {
      alignItems: 'center',
      marginTop: 8,
    },

    phaseLabel: {
      fontFamily: FONT_BOLD,
      fontSize: 24,
      letterSpacing: 2,
      marginBottom: 6,
    },

    countdown: {
      fontFamily: FONT_XB,
      fontSize: 44,
      color: C.text,
      fontVariant: ['tabular-nums'],
    },

    /* Cycles */
    cycles: {
      fontFamily: FONT_MEDIUM,
      fontSize: 13,
      color: C.muted,
      letterSpacing: 0.4,
    },

    /* Controls */
    controls: {
      width: '100%',
      alignItems: 'center',
      gap: 14,
    },

    primaryBtn: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      borderRadius: 14,
    },

    primaryBtnPressed: {
      opacity: 0.82,
    },

    primaryBtnText: {
      fontFamily: FONT_BOLD,
      fontSize: 13,
      letterSpacing: 1.4,
    },

    secondaryBtn: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.cardBorder,
      backgroundColor: C.card,
    },

    secondaryBtnPressed: {
      opacity: 0.7,
    },

    secondaryBtnText: {
      fontFamily: FONT_BOLD,
      fontSize: 13,
      letterSpacing: 1.4,
    },
  });
}