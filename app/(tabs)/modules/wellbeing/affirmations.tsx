import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Bell, ChevronLeft } from 'lucide-react-native';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';

/* ------------------------------------------------------------------ */
/* Theme palettes                                                      */
/* ------------------------------------------------------------------ */
const DARK_PALETTE = {
  bg: '#090909',
  card: '#151515',
  cardBorder: '#2A2A2A',
  text: '#F4F2EE',
  muted: '#AAA59D',
  divider: '#262626',
  danger: '#E05252',
};

const LIGHT_PALETTE = {
  bg: '#FBFAF8',
  card: '#FFFFFF',
  cardBorder: '#ECE9E4',
  text: '#27241F',
  muted: '#8F8A82',
  divider: '#F0EEEA',
  danger: '#E05252',
};

const FONT = 'Poppins-Regular';
const FONT_MEDIUM = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';
const FONT_XB = 'Poppins-ExtraBold';

const MODULE_KEY = 'affirmations';
const REGEN_INTERVAL_MS = 5 * 60 * 60 * 1000; // 5 hours

/* ------------------------------------------------------------------ */
/* Affirmation bank — 30 entries, each 3+ lines                         */
/* ------------------------------------------------------------------ */
const AFFIRMATIONS: string[] = [
  `I am worthy of the love and respect I give to others.\nMy presence is a gift to the people around me.\nI choose to honor my value every single day.`,
  `I am capable of handling whatever this day brings.\nChallenges help me grow stronger and wiser.\nI trust my ability to figure things out.`,
  `I release the need to control what I cannot change.\nI breathe in calm and breathe out worry.\nPeace is available to me in this moment.`,
  `My body is doing its best, and I treat it with kindness.\nI nourish myself with care and patience.\nI am grateful for all my body does for me.`,
  `I am exactly where I need to be right now.\nMy journey is unfolding in its own perfect timing.\nI trust the process of my life.`,
  `I give myself permission to rest without guilt.\nRest is productive and necessary for my wellbeing.\nI deserve moments of stillness.`,
  `I am surrounded by people who celebrate my growth.\nI attract relationships that uplift and inspire me.\nI am safe to be myself with others.`,
  `My voice matters, and my ideas have value.\nI speak my truth with confidence and clarity.\nI am heard and understood by those who matter.`,
  `I am resilient in the face of uncertainty.\nI have survived every difficult day so far.\nI will get through this too.`,
  `I choose progress over perfection.\nSmall steps forward are still forward motion.\nI celebrate my effort, not just my outcomes.`,
  `I am deserving of joy simply because I exist.\nHappiness is not something I must earn.\nI allow myself to feel good today.`,
  `I let go of comparisons to other people's lives.\nMy path is unique and not a competition.\nI measure success by my own values.`,
  `I am safe in my body and in this moment.\nI can handle the emotions that arise within me.\nI am grounded and secure.`,
  `Every breath I take calms my mind and soothes my heart.\nI return to my breath whenever I feel overwhelmed.\nMy breath is an anchor I can always trust.`,
  `I am proud of how far I have come.\nMy past does not define my future.\nI honor the growth I have already achieved.`,
  `I am open to receiving good things in my life.\nAbundance flows to me in expected and unexpected ways.\nI welcome blessings with open arms.`,
  `I forgive myself for the things I did not know.\nI am learning and evolving every day.\nI offer myself the same grace I offer others.`,
  `My feelings are valid and worthy of attention.\nI allow myself to feel without judgment.\nI move through my emotions with compassion.`,
  `I am enough, just as I am, in this moment.\nI do not need to prove my worth to anyone.\nI am complete and whole on my own.`,
  `I choose to focus on what I can influence.\nI release energy spent on what is beyond my control.\nMy attention is a precious resource I guard wisely.`,
  `I am a work in progress, and that is a beautiful thing.\nGrowth is messy and I embrace the mess.\nI am becoming who I am meant to be.`,
  `I trust my intuition to guide me toward what is right.\nMy inner wisdom knows the way.\nI listen to the quiet voice within me.`,
  `I am connected to something larger than myself.\nI am never truly alone in this world.\nI belong here, and I matter.`,
  `I am allowed to take up space in this world.\nMy needs and desires are important.\nI do not shrink to make others comfortable.`,
  `I choose courage over comfort when it matters most.\nBrave action is available to me even when I am afraid.\nI am braver than I believe.`,
  `I am gentle with myself when I struggle.\nHard days do not erase my progress.\nI offer myself tenderness in difficult moments.`,
  `I am building a life that feels good to live.\nMy choices today shape my tomorrow.\nI am the architect of my own happiness.`,
  `I radiate warmth and kindness to everyone I meet.\nMy energy is a light in this world.\nI make a positive difference simply by being me.`,
  `I am grounded in gratitude for this present moment.\nThere is beauty all around me when I look for it.\nI choose to notice the good today.`,
  `I am worthy of care, rest, and softness.\nI do not have to earn my right to exist.\nI treat myself as someone who matters.`,
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function todayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pickRandomIndex(exclude: number | null): number {
  if (AFFIRMATIONS.length === 1) return 0;
  let idx = Math.floor(Math.random() * AFFIRMATIONS.length);
  if (exclude !== null && AFFIRMATIONS.length > 1) {
    let guard = 0;
    while (idx === exclude && guard < 12) {
      idx = Math.floor(Math.random() * AFFIRMATIONS.length);
      guard += 1;
    }
  }
  return idx;
}

function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return 'New affirmation ready';
  const totalMinutes = Math.floor(remainingMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `New affirmation in ${hours}h ${minutes}m`;
}

/* ================================================================== */
/* Screen                                                              */
/* ================================================================== */
export default function AffirmationsScreen() {
  const { isDark, accentForeground, onAccent } = useApp();
  const accent = accentForeground;
  const COLORS = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  const styles = makeStyles(COLORS);

  const [affirmation, setAffirmation] = useState<string>(AFFIRMATIONS[0]);
  const [affirmationIdx, setAffirmationIdx] = useState<number>(0);
  const [lastGenerated, setLastGenerated] = useState<number>(Date.now());
  const [now, setNow] = useState<number>(Date.now());
  const [saving, setSaving] = useState<boolean>(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* ---- persist affirmation to wellbeing_entries ---- */
  const saveAffirmation = useCallback(async (text: string) => {
    setSaving(true);
    setSaveMsg(null);
    setError(null);
    const { error: upsertErr } = await supabase
      .from('wellbeing_entries')
      .upsert(
        {
          module_key: MODULE_KEY,
          entry_date: todayDate(),
          content: text,
        },
        { onConflict: 'module_key,entry_date' },
      );

    if (upsertErr) {
      setError('Could not save your affirmation. It will still show on screen.');
    } else {
      setSaveMsg('Saved.');
    }
    setSaving(false);
  }, []);

  /* ---- generate a new affirmation ---- */
  const generateNew = useCallback(
    (opts?: { fromAuto?: boolean }) => {
      const nextIdx = pickRandomIndex(affirmationIdx);
      const nextText = AFFIRMATIONS[nextIdx];
      setAffirmationIdx(nextIdx);
      setAffirmation(nextText);
      setLastGenerated(Date.now());
      setSaveMsg(null);
      setError(null);
      void saveAffirmation(nextText);
      if (opts?.fromAuto) {
        // silent auto-generation
      }
    },
    [affirmationIdx, saveAffirmation],
  );

  /* ---- on mount: auto-generate if 5 hours have passed ---- */
  useEffect(() => {
    const elapsed = Date.now() - lastGenerated;
    if (elapsed >= REGEN_INTERVAL_MS) {
      generateNew({ fromAuto: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- ticking clock for countdown ---- */
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 30 * 1000); // update every 30s
    return () => clearInterval(interval);
  }, []);

  const remainingMs = useMemo(() => {
    const elapsed = now - lastGenerated;
    return Math.max(0, REGEN_INTERVAL_MS - elapsed);
  }, [now, lastGenerated]);

  const countdownText = formatCountdown(remainingMs);

  /* ---------------------------------------------------------------- */
  return (
    <View style={styles.safe}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: 28 }]}>
        <Pressable
          onPress={() => router.push('/modules')}
          style={[styles.backBtn, { backgroundColor: accent }]}
          hitSlop={12}
          accessibilityLabel="Go back"
        >
          <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.headerTitle}>AFFIRMATIONS</Text>
        <Pressable style={styles.bellBtn} hitSlop={12} accessibilityLabel="Notifications">
          <Bell color={COLORS.text} size={20} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Eyebrow */}
        <Text style={[styles.eyebrow, { color: accent }]}>
          TODAY'S AFFIRMATION
        </Text>

        {/* Center affirmation card */}
        <View style={styles.card}>
          <View style={[styles.cardAccent, { backgroundColor: accent }]} />
          <Text style={styles.affirmationText}>{affirmation}</Text>
        </View>

        {/* Save feedback */}
        {saveMsg ? (
          <Text style={[styles.saveMsg, { color: accent }]}>{saveMsg}</Text>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Spacer pushes button + countdown toward the bottom */}
        <View style={styles.spacer} />

        {/* Countdown */}
        <Text style={styles.countdown}>{countdownText}</Text>

        {/* Generate button */}
        <Pressable
          onPress={() => generateNew()}
          disabled={saving}
          style={({ pressed }) => [
            styles.generateBtn,
            { backgroundColor: accent },
            saving && styles.generateBtnDisabled,
            pressed && styles.generateBtnPressed,
          ]}
          accessibilityLabel="Generate new affirmation"
        >
          {saving ? (
            <ActivityIndicator size="small" color={onAccent} />
          ) : (
            <Text style={[styles.generateBtnText, { color: onAccent }]}>GENERATE NEW AFFIRMATION</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */
type Palette = typeof DARK_PALETTE;
function makeStyles(C: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },

    /* Header */
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
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
    bellBtn: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
    },

    /* Scroll */
    scroll: {
      flexGrow: 1,
      padding: 20,
      paddingBottom: 40,
      justifyContent: 'center',
    },

    /* Eyebrow */
    eyebrow: {
      fontFamily: FONT_SEMI,
      fontSize: 13,
      letterSpacing: 0.4,
      marginBottom: 18,
      textTransform: 'uppercase',
      textAlign: 'center',
    },

    /* Affirmation card */
    card: {
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 18,
      padding: 24,
      paddingTop: 26,
      overflow: 'hidden',
    },
    cardAccent: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 4,
    },
    affirmationText: {
      fontFamily: FONT_MEDIUM,
      fontSize: 18,
      lineHeight: 28,
      color: C.text,
      textAlign: 'center',
    },

    /* Save feedback */
    saveMsg: {
      fontFamily: FONT_SEMI,
      fontSize: 12.5,
      marginTop: 14,
      textAlign: 'center',
    },
    errorText: {
      fontFamily: FONT_MEDIUM,
      fontSize: 12.5,
      color: C.danger,
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 18,
    },

    /* Spacer */
    spacer: {
      flex: 1,
      minHeight: 32,
    },

    /* Countdown */
    countdown: {
      fontFamily: FONT,
      fontSize: 12.5,
      color: C.muted,
      textAlign: 'center',
      marginBottom: 14,
      letterSpacing: 0.3,
    },

    /* Generate button */
    generateBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      borderRadius: 14,
    },
    generateBtnDisabled: {
      opacity: 0.5,
    },
    generateBtnPressed: {
      opacity: 0.82,
    },
    generateBtnText: {
      fontFamily: FONT_BOLD,
      fontSize: 13,
      letterSpacing: 1.2,
    },
  });
}
