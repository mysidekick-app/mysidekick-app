import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { ChevronLeft, MoreVertical } from 'lucide-react-native';

import { useApp } from '@/components/AppProvider';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';

/* ------------------------------------------------------------------ */
/* Theme palettes                                                     */
/* ------------------------------------------------------------------ */

const DARK_PALETTE = {
  bg: '#090909',
  card: '#121212',
  cardBorder: '#000000',
  text: '#FFFFFF',
  muted: '#A1A1AA',
  divider: '#262626',
  danger: '#EF4444',
};

const LIGHT_PALETTE = {
  bg: '#FBFAF8',
  card: '#FFFFFF',
  cardBorder: '#000000',
  text: '#000000',
  muted: '#52525B',
  divider: '#E4E4E7',
  danger: '#EF4444',
};

const FONT = 'Poppins-Regular';
const FONT_MEDIUM = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';
const FONT_XB = 'Poppins-ExtraBold';

const MODULE_KEY = 'affirmations';
const REGEN_INTERVAL_MS = 5 * 60 * 60 * 1000; // 5 hours

/* ------------------------------------------------------------------ */
/* Persistent storage                                                  */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = '@mysidekick_affirmation_state';

/* ------------------------------------------------------------------ */
/* Affirmation bank                                                    */
/* ------------------------------------------------------------------ */

const AFFIRMATIONS: string[] = [
  `I am worthy of the love and respect I give to others.
My presence is a gift to the people around me.
I choose to honor my value every single day.`,

  `I am capable of handling whatever this day brings.
Challenges help me grow stronger and wiser.
I trust my ability to figure things out.`,

  `I release the need to control what I cannot change.
I breathe in calm and breathe out worry.
Peace is available to me in this moment.`,

  `My body is doing its best, and I treat it with kindness.
I nourish myself with care and patience.
I am grateful for all my body does for me.`,

  `I am exactly where I need to be right now.
My journey is unfolding in its own perfect timing.
I trust the process of my life.`,

  `I give myself permission to rest without guilt.
Rest is productive and necessary for my wellbeing.
I deserve moments of stillness.`,

  `I am surrounded by people who celebrate my growth.
I attract relationships that uplift and inspire me.
I am safe to be myself with others.`,

  `My voice matters, and my ideas have value.
I speak my truth with confidence and clarity.
I am heard and understood by those who matter.`,

  `I am resilient in the face of uncertainty.
I have survived every difficult day so far.
I will get through this too.`,

  `I choose progress over perfection.
Small steps forward are still forward motion.
I celebrate my effort, not just my outcomes.`,

  `I am deserving of joy simply because I exist.
Happiness is not something I must earn.
I allow myself to feel good today.`,

  `I let go of comparisons to other people's lives.
My path is unique and not a competition.
I measure success by my own values.`,

  `I am safe in my body and in this moment.
I can handle the emotions that arise within me.
I am grounded and secure.`,

  `Every breath I take calms my mind and soothes my heart.
I return to my breath whenever I feel overwhelmed.
My breath is an anchor I can always trust.`,

  `I am proud of how far I have come.
My past does not define my future.
I honor the growth I have already achieved.`,

  `I am open to receiving good things in my life.
Abundance flows to me in expected and unexpected ways.
I welcome blessings with open arms.`,

  `I forgive myself for the things I did not know.
I am learning and evolving every day.
I offer myself the same grace I offer others.`,

  `My feelings are valid and worthy of attention.
I allow myself to feel without judgment.
I move through my emotions with compassion.`,

  `I am enough, just as I am, in this moment.
I do not need to prove my worth to anyone.
I am complete and whole on my own.`,

  `I choose to focus on what I can influence.
I release energy spent on what is beyond my control.
My attention is a precious resource I guard wisely.`,

  `I am a work in progress, and that is a beautiful thing.
Growth is messy and I embrace the mess.
I am becoming who I am meant to be.`,

  `I trust my intuition to guide me toward what is right.
My inner wisdom knows the way.
I listen to the quiet voice within me.`,

  `I am connected to something larger than myself.
I am never truly alone in this world.
I belong here, and I matter.`,

  `I am allowed to take up space in this world.
My needs and desires are important.
I do not shrink to make others comfortable.`,

  `I choose courage over comfort when it matters most.
Brave action is available to me even when I am afraid.
I am braver than I believe.`,

  `I am gentle with myself when I struggle.
Hard days do not erase my progress.
I offer myself tenderness in difficult moments.`,

  `I am building a life that feels good to live.
My choices today shape my tomorrow.
I am the architect of my own happiness.`,

  `I radiate warmth and kindness to everyone I meet.
My energy is a light in this world.
I make a positive difference simply by being me.`,

  `I am grounded in gratitude for this present moment.
There is beauty all around me when I look for it.
I choose to notice the good today.`,

  `I am worthy of care, rest, and softness.
I do not have to earn my right to exist.
I treat myself as someone who matters.`,
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

type StoredAffirmation = {
  index: number;
  generatedAt: number;
};

function pickRandomIndex(exclude: number | null): number {
  if (AFFIRMATIONS.length === 1) {
    return 0;
  }

  let idx = Math.floor(Math.random() * AFFIRMATIONS.length);

  if (exclude !== null && AFFIRMATIONS.length > 1) {
    let guard = 0;

    while (idx === exclude && guard < 20) {
      idx = Math.floor(Math.random() * AFFIRMATIONS.length);
      guard += 1;
    }
  }

  return idx;
}

function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) {
    return 'New affirmation ready';
  }

  const totalMinutes = Math.floor(
    remainingMs / (60 * 1000),
  );

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `New affirmation in ${hours}h ${minutes}m`;
}

/* ================================================================== */
/* Screen                                                              */
/* ================================================================== */

export default function AffirmationsScreen() {
  const {
    isDark,
    accentForeground,
    onAccent,
  } = useApp() as any;

  const { user } = useAuth();

  const accent = accentForeground || '#FDE047';
  const pageBg = accent;

  const COLORS = isDark
    ? DARK_PALETTE
    : LIGHT_PALETTE;

  const styles = makeStyles(COLORS);

  const [affirmation, setAffirmation] =
    useState<string>(AFFIRMATIONS[0]);

  const [affirmationIdx, setAffirmationIdx] =
    useState<number>(0);

  const [lastGenerated, setLastGenerated] =
    useState<number>(Date.now());

  const [now, setNow] =
    useState<number>(Date.now());

  const [loading, setLoading] =
    useState<boolean>(true);

  const [saving, setSaving] =
    useState<boolean>(false);

  const [saveMsg, setSaveMsg] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [menuOpen, setMenuOpen] =
    useState<boolean>(false);

  /* -------------------------------------------------------------- */
  /* Save locally first                                              */
  /* -------------------------------------------------------------- */

  const persistLocal = useCallback(
    async (
      index: number,
      generatedAt: number,
    ) => {
      try {
        const state: StoredAffirmation = {
          index,
          generatedAt,
        };

        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(state),
        );
      } catch (storageError) {
        console.error(
          'FAILED TO SAVE AFFIRMATION LOCALLY:',
          storageError,
        );
      }
    },
    [],
  );

  /* -------------------------------------------------------------- */
  /* Save to Supabase                                                 */
  /* -------------------------------------------------------------- */

  const saveAffirmation = useCallback(
    async (text: string) => {
      if (!user) {
        return;
      }

      setSaving(true);
      setSaveMsg(null);
      setError(null);

      const { error: upsertErr } = await supabase
        .from('wellbeing_entries')
        .upsert(
          {
            user_id: user.id,
            module_key: MODULE_KEY,
            entry_date:
              new Date()
                .toISOString()
                .split('T')[0],
            content: text,
          },
          {
            onConflict:
              'user_id,module_key,entry_date',
          },
        );

      if (upsertErr) {
        console.error(
          'FAILED TO SAVE AFFIRMATION:',
          {
            message: upsertErr.message,
            code: upsertErr.code,
            details: upsertErr.details,
            hint: upsertErr.hint,
          },
        );

        setError(
          'Affirmation saved on this device.',
        );
      } else {
        setSaveMsg('Saved.');
      }

      setSaving(false);
    },
    [user],
  );

  /* -------------------------------------------------------------- */
  /* Generate a new affirmation                                     */
  /* -------------------------------------------------------------- */

  const generateNew = useCallback(
    async (opts?: { fromAuto?: boolean }) => {
      const nextIdx =
        pickRandomIndex(affirmationIdx);

      const nextText =
        AFFIRMATIONS[nextIdx];

      const generatedAt = Date.now();

      setAffirmationIdx(nextIdx);
      setAffirmation(nextText);
      setLastGenerated(generatedAt);
      setNow(generatedAt);
      setSaveMsg(null);
      setError(null);

      await persistLocal(
        nextIdx,
        generatedAt,
      );

      await saveAffirmation(nextText);

      if (opts?.fromAuto) {
        setSaveMsg(null);
        setError(null);
      }
    },
    [
      affirmationIdx,
      persistLocal,
      saveAffirmation,
    ],
  );

  /* -------------------------------------------------------------- */
  /* Load persisted affirmation                                      */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    const loadAffirmation = async () => {
      try {
        const stored =
          await AsyncStorage.getItem(
            STORAGE_KEY,
          );

        if (cancelled) {
          return;
        }

        if (!stored) {
          const firstIdx = 0;
          const generatedAt = Date.now();

          setAffirmationIdx(firstIdx);
          setAffirmation(
            AFFIRMATIONS[firstIdx],
          );
          setLastGenerated(generatedAt);
          setNow(generatedAt);

          await persistLocal(
            firstIdx,
            generatedAt,
          );

          setLoading(false);
          return;
        }

        const parsed =
          JSON.parse(stored) as StoredAffirmation;

        const storedIndex =
          Number.isInteger(parsed.index) &&
          parsed.index >= 0 &&
          parsed.index < AFFIRMATIONS.length
            ? parsed.index
            : 0;

        const storedGeneratedAt =
          typeof parsed.generatedAt === 'number'
            ? parsed.generatedAt
            : Date.now();

        const elapsed =
          Date.now() - storedGeneratedAt;

        if (
          elapsed >= REGEN_INTERVAL_MS
        ) {
          const nextIdx =
            pickRandomIndex(storedIndex);

          const nextText =
            AFFIRMATIONS[nextIdx];

          const generatedAt =
            Date.now();

          setAffirmationIdx(nextIdx);
          setAffirmation(nextText);
          setLastGenerated(
            generatedAt,
          );
          setNow(generatedAt);

          await persistLocal(
            nextIdx,
            generatedAt,
          );

          setLoading(false);

          void saveAffirmation(nextText);

          return;
        }

        setAffirmationIdx(storedIndex);
        setAffirmation(
          AFFIRMATIONS[storedIndex],
        );
        setLastGenerated(
          storedGeneratedAt,
        );
        setNow(Date.now());
      } catch (loadError) {
        console.error(
          'FAILED TO LOAD AFFIRMATION:',
          loadError,
        );

        const fallbackIdx = 0;
        const generatedAt = Date.now();

        setAffirmationIdx(
          fallbackIdx,
        );

        setAffirmation(
          AFFIRMATIONS[fallbackIdx],
        );

        setLastGenerated(
          generatedAt,
        );

        setNow(generatedAt);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadAffirmation();

    return () => {
      cancelled = true;
    };
  }, [
    persistLocal,
    saveAffirmation,
  ]);

  /* -------------------------------------------------------------- */
  /* Countdown                                                       */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 30 * 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  /* -------------------------------------------------------------- */
  /* Automatically generate after five hours                        */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    if (loading) {
      return;
    }

    const elapsed =
      now - lastGenerated;

    if (
      elapsed >= REGEN_INTERVAL_MS
    ) {
      void generateNew({
        fromAuto: true,
      });
    }
  }, [
    now,
    lastGenerated,
    loading,
    generateNew,
  ]);

  const remainingMs = useMemo(() => {
    const elapsed =
      now - lastGenerated;

    return Math.max(
      0,
      REGEN_INTERVAL_MS - elapsed,
    );
  }, [now, lastGenerated]);

  const countdownText =
    formatCountdown(remainingMs);

  /* -------------------------------------------------------------- */
  /* Settings                                                         */
  /* -------------------------------------------------------------- */

  const openSettings = useCallback(() => {
    setMenuOpen(false);
    router.push('/(tabs)/profile');
  }, []);

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: pageBg }]}
      edges={['top', 'bottom']}
    >
      <StatusBar barStyle="dark-content" backgroundColor={pageBg} />

      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: 12 },
        ]}
      >
        <Pressable
          onPress={() =>
            router.push(
              '/(tabs)/modules/wellbeing',
            )
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

        <View
          style={styles.headerTitleWrap}
        >
          <Text
            style={[styles.headerTitle, { color: '#000000' }]}
          >
            AFFIRMATIONS
          </Text>
        </View>

        <Pressable
          onPress={() =>
            setMenuOpen(prev => !prev)
          }
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

      {/* Settings menu */}

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

      {/* Main content */}

      <ScrollView
        contentContainerStyle={
          styles.scroll
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.centerContent}>

          {/* Affirmation card */}

          {loading ? (
            <View
              style={styles.loadingContainer}
            >
              <ActivityIndicator
                size="large"
                color="#000000"
              />
            </View>
          ) : (
            <View style={styles.cardContainer}>
              <View style={styles.cardShadowBackdrop} />
              <View style={[styles.card, { backgroundColor: COLORS.card, borderColor: '#000000' }]}>
                <Text
                  style={[
                    styles.affirmationText,
                    { color: COLORS.text },
                  ]}
                >
                  {affirmation}
                </Text>
              </View>
            </View>
          )}

          {/* Feedback */}

          {saveMsg ? (
            <Text
              style={[
                styles.saveMsg,
                { color: '#000000' },
              ]}
            >
              {saveMsg}
            </Text>
          ) : null}

          {error ? (
            <Text
              style={styles.errorText}
            >
              {error}
            </Text>
          ) : null}

        </View>

        {/* Bottom controls */}

        <View
          style={styles.bottomControls}
        >
          <Text
            style={[styles.countdown, { color: '#000000' }]}
          >
            {countdownText}
          </Text>

          <View style={styles.cardContainer}>
            <View style={styles.cardShadowBackdrop} />
            <Pressable
              onPress={() =>
                void generateNew()
              }
              disabled={saving}
              style={({ pressed }) => [
                styles.generateBtn,
                {
                  backgroundColor: '#000000',
                  borderColor: '#000000',
                },
                saving &&
                  styles.generateBtnDisabled,
                pressed &&
                  styles.pressedBtn,
              ]}
              accessibilityLabel="Generate new affirmation"
            >
              {saving ? (
                <ActivityIndicator
                  size="small"
                  color="#FFFFFF"
                />
              ) : (
                <Text
                  style={[
                    styles.generateBtnText,
                    {
                      color: '#FFFFFF',
                    },
                  ]}
                >
                  GENERATE NEW AFFIRMATION
                </Text>
              )}
            </Pressable>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
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

    headerTitleWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    headerTitle: {
      fontFamily: FONT_XB,
      fontSize: 22,
      letterSpacing: 1,
      textAlign: 'center',
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

    menuItemPressed: {
      opacity: 0.6,
    },

    menuItemText: {
      fontFamily: FONT_BOLD,
      fontSize: 13,
    },

    /* Main scroll area */

    scroll: {
      flexGrow: 1,
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 100,
    },

    centerContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
    },

    /* Card shadow container */

    cardContainer: {
      position: 'relative',
      width: '100%',
      maxWidth: 520,
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

    /* Affirmation card */

    card: {
      width: '100%',
      borderRadius: 16,
      borderWidth: 3,
      paddingHorizontal: 24,
      paddingVertical: 26,
    },

    affirmationText: {
      fontFamily: FONT_MEDIUM,
      fontSize: 18,
      lineHeight: 28,
      textAlign: 'center',
    },

    loadingContainer: {
      minHeight: 180,
      alignItems: 'center',
      justifyContent: 'center',
    },

    /* Feedback */

    saveMsg: {
      fontFamily: FONT_XB,
      fontSize: 13,
      marginTop: 14,
      textAlign: 'center',
    },

    errorText: {
      fontFamily: FONT_BOLD,
      fontSize: 13,
      color: '#DC2626',
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 18,
    },

    /* Bottom controls */

    bottomControls: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'flex-end',
      marginTop: 24,
    },

    countdown: {
      fontFamily: FONT_BOLD,
      fontSize: 13,
      textAlign: 'center',
      marginBottom: 14,
      letterSpacing: 0.3,
    },

    /* Generate button */

    generateBtn: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      borderRadius: 16,
      borderWidth: 3,
    },

    generateBtnDisabled: {
      opacity: 0.5,
    },

    generateBtnText: {
      fontFamily: FONT_XB,
      fontSize: 15,
      letterSpacing: 1.2,
    },
  });
}