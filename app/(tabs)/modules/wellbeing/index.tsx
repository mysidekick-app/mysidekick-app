import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  Flame,
  Heart,
  Moon,
  MoreVertical,
  Sparkles,
  Sun,
  Wind,
} from 'lucide-react-native';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';

type ModuleKey =
  | 'journaling'
  | 'morning_pages'
  | 'shadow_work'
  | 'affirmations'
  | 'mood_tracker'
  | 'delights'
  | 'breathwork';

type ModuleDef = {
  key: ModuleKey;
  label: string;
  icon: typeof BookOpen;
  route: string;
};

const MODULE_CATALOG: ModuleDef[] = [
  { key: 'journaling', label: 'Journaling', icon: BookOpen, route: '/modules/wellbeing/entry?module=journaling' },
  { key: 'morning_pages', label: 'Blank Pages', icon: Sun, route: '/modules/wellbeing/entry?module=morning_pages' },
  { key: 'shadow_work', label: 'Shadow Work', icon: Moon, route: '/modules/wellbeing/entry?module=shadow_work' },
  { key: 'affirmations', label: 'Affirmations', icon: Sparkles, route: '/modules/wellbeing/affirmations' },
  { key: 'mood_tracker', label: 'Mood Tracker', icon: Activity, route: '/modules/wellbeing/mood' },
  { key: 'delights', label: 'Delights', icon: Heart, route: '/modules/wellbeing/delights' },
  { key: 'breathwork', label: 'Breathwork', icon: Wind, route: '/modules/wellbeing/breathwork' },
];

const FONT_MED = 'Poppins-Medium';
const FONT_BOLD = 'Poppins-Bold';
const FONT_XB = 'Poppins-ExtraBold';

function isAccentBlack(color?: string): boolean {
  if (!color) return false;
  const normalized = color.trim().toLowerCase();
  return (
    normalized === '#000000' ||
    normalized === '#000' ||
    normalized === 'black' ||
    normalized === 'rgb(0,0,0)' ||
    normalized === 'rgba(0,0,0,1)'
  );
}

function calculateStreak(dates: string[]): number {
  if (!dates || dates.length === 0) return 0;
  const uniqueDates = Array.from(
    new Set(dates.map((d) => d.split('T')[0]))
  )
    .sort()
    .reverse();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yestStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  let streak = 0;
  let expectedDate = new Date();

  if (!uniqueDates.includes(todayStr) && !uniqueDates.includes(yestStr)) {
    return 0;
  }

  if (!uniqueDates.includes(todayStr)) {
    expectedDate = yesterday;
  }

  for (const dateStr of uniqueDates) {
    const expStr = `${expectedDate.getFullYear()}-${String(expectedDate.getMonth() + 1).padStart(2, '0')}-${String(expectedDate.getDate()).padStart(2, '0')}`;
    if (dateStr === expStr) {
      streak++;
      expectedDate.setDate(expectedDate.getDate() - 1);
    } else if (dateStr < expStr) {
      break;
    }
  }
  return streak;
}

export default function WellbeingDashboard() {
  const { isDark, accentForeground, accentColor: rawAccent } = useApp() as any;

  const pageBg = rawAccent || accentForeground || '#FDE047';
  const isAccentPureBlack = isAccentBlack(pageBg);

  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const currentUserId = userData.user?.id ?? null;

    if (userErr || !currentUserId) {
      setError('Your account could not be identified. Please sign in again.');
      setLoading(false);
      return;
    }

    const { data: entriesData, error: entriesErr } = await supabase
      .from('wellbeing_entries')
      .select('module_key, created_at')
      .eq('user_id', currentUserId);

    if (entriesErr) {
      setError('Your well-being data could not be loaded.');
      setLoading(false);
      return;
    }

    const calculatedStreaks: Record<string, number> = {};
    const entriesList = entriesData ?? [];
    const grouped: Record<string, string[]> = {};

    for (const entry of entriesList) {
      const mKey = entry.module_key;
      if (!grouped[mKey]) grouped[mKey] = [];
      if (entry.created_at) grouped[mKey].push(entry.created_at);
    }

    for (const [mKey, dates] of Object.entries(grouped)) {
      calculatedStreaks[mKey] = calculateStreak(dates);
    }

    setStreaks(calculatedStreaks);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openModule = (route: string) => router.push(route as never);

  const C = isDark
    ? {
        menuBg: '#121212',
        menuText: '#FFFFFF',
      }
    : {
        menuBg: '#FFFFFF',
        menuText: '#000000',
      };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]}>
      <StatusBar
        barStyle={isAccentPureBlack ? 'light-content' : 'dark-content'}
        backgroundColor={pageBg}
      />

      {/* STICKY HEADER WITH TITLE IN THE MIDDLE */}
      <View style={[styles.headerContainer, { backgroundColor: pageBg }]}>
        <Pressable
          onPress={() => router.push('/modules')}
          style={({ pressed }) => [styles.neoBtn, pressed && styles.pressedBtn]}
          hitSlop={12}
        >
          <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.8} />
        </Pressable>

        <Text style={styles.headerTitle} numberOfLines={1}>
          WELL-BEING
        </Text>

        <Pressable
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [styles.threeDotsBtn, pressed && styles.pressedBtn]}
          hitSlop={12}
        >
          <MoreVertical color="#000000" size={24} strokeWidth={2.5} />
        </Pressable>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.menuShade} onPress={() => setMenuOpen(false)}>
          <Pressable
            style={[styles.menuCard, { backgroundColor: C.menuBg }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                router.push('/(tabs)/profile');
              }}
              style={styles.menuItem}
            >
              <Text style={[styles.menuItemText, { color: C.menuText }]}>
                Settings
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* OVERLAPPING SCROLLABLE CARDS */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color="#000000" />
            <Text style={styles.stateText}>Loading well-being modules…</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={load} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.cardsStack}>
            {MODULE_CATALOG.map((m, index) => {
              const streakCount = streaks[m.key] ?? 0;

              return (
                <View
                  key={m.key}
                  style={[
                    styles.cardContainer,
                    index > 0 && styles.overlappingCard,
                  ]}
                >
                  <View style={styles.cardShadowBackdrop} />
                  <Pressable
                    onPress={() => openModule(m.route)}
                    style={({ pressed }) => [
                      styles.moduleCardBody,
                      {
                        backgroundColor: isDark ? '#000000' : '#FFFFFF', // Black in dark mode, white in light mode
                        borderColor: '#000000',
                      },
                      pressed && styles.pressedBtn,
                    ]}
                  >
                    {/* MODULE TITLE WITH AN ARROW ROTATED AT 45 DEGREES */}
                    <View style={styles.cardLeftContent}>
                      <Text
                        style={[
                          styles.moduleTitleText,
                          { color: isDark ? '#FFFFFF' : '#000000' },
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {m.label.toUpperCase()}
                      </Text>
                      <View style={styles.arrowContainer}>
                        <ArrowRight
                          color={isDark ? '#FFFFFF' : '#000000'}
                          size={22}
                          strokeWidth={2.8}
                        />
                      </View>
                    </View>

                    {/* STREAK COUNT BADGE WITH GLOBAL ACCENT BACKGROUND */}
                    <View style={[styles.streakBadge, { backgroundColor: pageBg }]}>
                      <Flame color="#000000" size={18} strokeWidth={2.5} />
                      <Text style={styles.streakCountText}>
                        {streakCount} {streakCount === 1 ? 'DAY' : 'DAYS'}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  pressedBtn: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },

  /* STICKY HEADER */
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    zIndex: 100,
  },
  neoBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  threeDotsBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONT_XB,
    fontSize: 20,
    letterSpacing: 1,
    color: '#000000',
    textAlign: 'center',
    flex: 1,
  },

  /* MENU DROPDOWN */
  menuShade: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'flex-end',
    paddingTop: 64,
    paddingRight: 20,
  },
  menuCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#000000',
    paddingVertical: 6,
    minWidth: 155,
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontFamily: FONT_BOLD,
    fontSize: 14,
  },

  /* SCROLL CONTAINER */
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 50,
  },

  /* OVERLAPPING CARDS STACK */
  cardsStack: {
    paddingTop: 4,
  },
  cardContainer: {
    position: 'relative',
    width: '100%',
  },
  overlappingCard: {
    marginTop: 11,
  },
  cardShadowBackdrop: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: -5,
    bottom: -5,
    backgroundColor: '#000000',
    borderRadius: 16,
  },
  moduleCardBody: {
    borderRadius: 16,
    borderWidth: 5,
    paddingVertical: 26,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 122,
  },
  cardLeftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  moduleTitleText: {
    fontFamily: FONT_XB,
    fontSize: 24,
    letterSpacing: 0.8,
  },
  arrowContainer: {
    transform: [{ rotate: '-45deg' }],
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  streakCountText: {
    fontFamily: FONT_XB,
    fontSize: 13,
    color: '#000000',
  },

  /* STATES */
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  stateText: {
    fontFamily: FONT_MED,
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: FONT_BOLD,
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#000000',
  },
  retryText: {
    fontFamily: FONT_BOLD,
    fontSize: 13,
    color: '#FFFFFF',
  },
});