import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  Bookmark,
  CheckCircle2,
  Gamepad2,
  HeartPulse,
  ListChecks,
  Sprout,
  WalletCards,
  ArrowUpRight,
} from 'lucide-react-native';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import SidekickAvatar from '@/components/SidekickAvatar';
import { formatMoney } from '@/components/currencies';
/* =========================================================*
*   FONTS*
*========================================================= */
const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_BOLD = 'Poppins-Bold';
/* =========================================================*
*   AFFIRMATIONS DATA & STORAGE KEY*
*========================================================= */
const AFFIRMATIONS_STORAGE_KEY = '@mysidekick_affirmation_state';
const AFFIRMATIONS_BANK: string[] = [
  'I am worthy of the love and respect I give to others. My presence is a gift to the people around me.',
  'I am capable of handling whatever this day brings. Challenges help me grow stronger and wiser.',
  'I release the need to control what I cannot change. Peace is available to me in this moment.',
  'My body is doing its best, and I treat it with kindness. I nourish myself with care.',
  'I am exactly where I need to be right now. I trust the process of my life.',
  'I give myself permission to rest without guilt. Rest is productive and necessary for my wellbeing.',
  'I choose progress over perfection. Small steps forward are still forward motion.',
  'I am deserving of joy simply because I exist. I allow myself to feel good today.',
  'I am resilient in the face of uncertainty. I will get through this too.',
  'I am enough, just as I am, in this moment. I do not need to prove my worth to anyone.',
];
/* =========================================================*
*   GREETINGS ROTATION (Changes every 2 hours)*
*========================================================= */
const GREETINGS = [
  'Ciao',
  'Bonjour',
  'Habari',
  'Hola',
  'Hello',
  'Konnichiwa',
  'Namaste',
  'Guten Tag',
  'Ola',
  'Nǐ Hǎo',
  'Aloha',
  'Salute',
];
function getRotatingGreeting(timeZone: string = 'Africa/Nairobi'): string {
  let currentHour = new Date().getHours();
  try {
    const hourPart = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone,
    }).format(new Date());
    currentHour = Number(hourPart);
  } catch (error) {
    console.warn('Invalid timezone for greeting:', timeZone);
  }
  const slot = Math.floor(currentHour / 2) % GREETINGS.length;
  return GREETINGS[slot];
}
function formatHeaderDateTime(timeZone: string = 'Africa/Nairobi'): string {
  const now = new Date();
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone,
    }).format(now);
  } catch (error) {
    console.warn('Invalid timezone for header clock:', timeZone);
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(now);
  }
}
/* =========================================================*
*   TYPES*
*========================================================= */
export type ListItemPreview = {
  text: string;
  isOverdue?: boolean;
};
export type FolderModuleData = {
  key: string;
  title: string;
  icon: typeof WalletCards;
  value: string;
  valueColor?: string;
  subtitle: string;
  items?: ListItemPreview[];
  footerNote?: string;
  route: string;
};
/* =========================================================*
*   DATE HELPERS*
*========================================================= */
function getTodayKey(timeZone: string = 'Africa/Nairobi'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values: Record<string, string> = {};
  parts.forEach((part) => {
    values[part.type] = part.value;
  });
  return `${values.year}-${values.month}-${values.day}`;
}
function getHabitFrequencyKey(frequency?: string | null): string {
  const value = (frequency || 'daily').toLowerCase().trim();
  if (['yearly', 'annual', 'annually', 'year'].includes(value)) return 'annually';
  if (['monthly', 'month'].includes(value)) return 'monthly';
  if (['weekly', 'week'].includes(value)) return 'weekly';
  return 'daily';
}
function getHabitPeriodStart(today: string, frequency?: string | null): string {
  const normalized = getHabitFrequencyKey(frequency);
  if (normalized === 'annually') return `${today.slice(0, 4)}-01-01`;
  if (normalized === 'monthly') return `${today.slice(0, 7)}-01`;
  if (normalized === 'weekly') {
    const date = parseDate(today);
    const day = date.getDay();
    date.setDate(date.getDate() - ((day + 6) % 7));
    return formatDate(date);
  }
  return today;
}
function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}
function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}
function addDays(dateString: string, days: number): string {
  const date = parseDate(dateString);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}
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
/* =========================================================*
*   LISTS TITLE FORMATTER*
*========================================================= */
function formatListTitleWithCount(title: string, count: number): string {
  const trimmed = title.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const baseTitle = words.length > 1 ? `${words[0]}...` : words[0] || 'List';
  const itemLabel = count === 1 ? '1 item' : `${count} items`;
  return `${baseTitle} (${itemLabel})`;
}
/* =========================================================*
*   CROSS-PLATFORM NEO-BRUTALIST FOLDER CARD*
*========================================================= */
const BLACK_MODULE_KEYS = new Set(['habits', 'reminders', 'plants', 'lists']);
function NeoFolderCard({
  item,
  accentColor,
  loading,
  onPress,
}: {
  item: FolderModuleData;
  accentColor: string;
  loading: boolean;
  onPress: () => void;
}) {
  const Icon = item.icon;
  const isBlackCard = BLACK_MODULE_KEYS.has(item.key);
  const cardBg = isBlackCard ? '#000000' : '#FFFFFF';
  const textColor = isBlackCard ? '#FFFFFF' : '#000000';
  const subtextColor = isBlackCard ? '#9CA3AF' : '#52525B';
  const cardBorderColor = '#000000';
  const iconStrokeColor = isAccentBlack(accentColor) ? '#FFFFFF' : '#000000';
  const defaultValColor = item.valueColor || textColor;
  const firstTwoItems = (item.items || []).slice(0, 2);
  const thirdItem = (item.items || [])[2];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.folderWrapper,
        pressed && styles.folderWrapperPressed,
      ]}
    >
      {/* 1. SOLID OFFSET BACKDROP FOR HARD DROP SHADOW (iOS, Android, Web) */}
      <View style={styles.cardShadowBackdrop} />
      {/* 2. CARD TAB */}
      <View
        style={[
          styles.folderTab,
          {
            backgroundColor: cardBg,
            borderColor: cardBorderColor,
          },
        ]}
      />
      {/* 3. CARD MAIN BODY WITH 2.5 BRUTALIST BORDER */}
      <View
        style={[
          styles.folderBody,
          {
            backgroundColor: cardBg,
            borderColor: cardBorderColor,
          },
        ]}
      >
        {/* ROW 1: ICON + TITLE + ARROW */}
        <View style={styles.cardHeaderRow}>
          <View style={styles.headerLeft}>
            <View
              style={[
                styles.iconRoundedRect,
                {
                  backgroundColor: accentColor,
                  borderColor: '#000000',
                },
              ]}
            >
              <Icon size={13} color={iconStrokeColor} strokeWidth={2.4} />
            </View>
            <Text style={[styles.cardTitle, { color: textColor }]} numberOfLines={1}>
              {item.title}
            </Text>
          </View>
          <ArrowUpRight size={17} color={textColor} strokeWidth={2.4} />
        </View>
        {/* ROW 2: NUMBER / VALUE */}
        <Text
          style={[styles.cardValue, { color: defaultValColor }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {loading ? '—' : item.value}
        </Text>
        {/* ROW 3: SUBTITLE */}
        <Text style={[styles.cardSubtitle, { color: subtextColor }]} numberOfLines={1}>
          {item.subtitle}
        </Text>
        {/* ROW 4+: ACTIONABLE LIST */}
        {item.items && item.items.length > 0 && (
          <View style={styles.listSection}>
            {firstTwoItems.map((listItem, i) => (
              <View key={i} style={styles.listItemRow}>
                <Text
                  style={[
                    styles.listArrow,
                    { color: listItem.isOverdue ? '#EF4444' : textColor },
                  ]}
                >
                  ↳
                </Text>
                <Text
                  style={[
                    styles.listItemText,
                    {
                      color: listItem.isOverdue ? '#EF4444' : textColor,
                      fontFamily: listItem.isOverdue ? FONT_BOLD : FONT,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {listItem.text}
                </Text>
              </View>
            ))}
            {thirdItem && (
              <View style={[styles.listItemRow, styles.shadowRow]}>
                <Text style={[styles.listArrow, { color: subtextColor, opacity: 0.35 }]}>
                  ↳
                </Text>
                <Text
                  style={[styles.listItemText, { color: subtextColor, opacity: 0.35 }]}
                  numberOfLines={1}
                >
                  {thirdItem.text}
                </Text>
              </View>
            )}
          </View>
        )}
        {/* AFFIRMATION FOOTER */}
        {item.footerNote && (
          <Text style={[styles.cardAffirmation, { color: textColor }]} numberOfLines={2}>
            {item.footerNote}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
/* =========================================================*
*   MAIN MODULES SCREEN*
*========================================================= */
export default function ModulesScreen() {
  const appContext = useApp() as any;
  const {
    accentForeground,
    accentColor: rawAccent,
    user: appUser,
    profile: appProfile,
    display_name: appDisplayName,
    currency_code,
    timezone: appTimezone,
    sidekick_id,
  } = appContext;
  const initialFirstName = (appDisplayName || appProfile?.display_name || appProfile?.name || 'Friend')
    .trim()
    .split(/\s+/)[0];
  const [userName, setUserName] = useState<string>(initialFirstName);
  const timeZone = appTimezone || 'Africa/Nairobi';
  const [greeting, setGreeting] = useState<string>(getRotatingGreeting(timeZone));
  const [headerDateTime, setHeaderDateTime] = useState<string>(() => formatHeaderDateTime(timeZone));
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (appDisplayName) {
      setUserName(appDisplayName.trim().split(/\s+/)[0]);
    }
  }, [appDisplayName]);
  // Module states
  const [habitsCount, setHabitsCount] = useState(0);
  const [habitItems, setHabitItems] = useState<ListItemPreview[]>([]);
  const [financeNet, setFinanceNet] = useState<number>(0);
  const [listsCount, setListsCount] = useState(0);
  const [listModuleItems, setListModuleItems] = useState<ListItemPreview[]>([]);
  const [remindersCount, setRemindersCount] = useState(0);
  const [reminderSubtitle, setReminderSubtitle] = useState('Due today');
  const [reminderItems, setReminderItems] = useState<ListItemPreview[]>([]);
  const [bookmarksCount, setBookmarksCount] = useState(0);
  const [plantsAttentionCount, setPlantsAttentionCount] = useState(0);
  const [plantItems, setPlantItems] = useState<ListItemPreview[]>([]);
  const [wellbeingDone, setWellbeingDone] = useState(0);
  const [gamesCount, setGamesCount] = useState(0);
  const globalAccent = rawAccent || accentForeground || '#FDE047';
  const pageBg = accentForeground || globalAccent;
  const isAccentPureBlack = isAccentBlack(pageBg);
  const headerTextColor = isAccentPureBlack ? '#FFFFFF' : '#000000';
  useEffect(() => {
    const updateHeaderTime = () => {
      setHeaderDateTime(formatHeaderDateTime(timeZone));
      setGreeting(getRotatingGreeting(timeZone));
    };
    updateHeaderTime();
    const timer = setInterval(updateHeaderTime, 60 * 1000);
    return () => clearInterval(timer);
  }, [timeZone]);
  const loadProfile = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const currentUserId = user?.id || appUser?.id;
      if (!currentUserId) return;
      const { data } = await supabase
        .from('profiles')
        .select('name, display_name, full_name, username')
        .or(`id.eq.${currentUserId},user_id.eq.${currentUserId}`)
        .maybeSingle();
      const resolved =
        appDisplayName ||
        data?.display_name ||
        data?.name ||
        data?.full_name ||
        data?.username ||
        appProfile?.display_name ||
        appProfile?.name ||
        appProfile?.full_name ||
        user?.user_metadata?.name ||
        user?.user_metadata?.full_name ||
        'Friend';
      const firstNameOnly = resolved.trim().split(/\s+/)[0] || 'Friend';
      setUserName(firstNameOnly);
    } catch (e) {
      console.log('Error loading profile name:', e);
    }
  }, [appProfile, appUser, appDisplayName]);
  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const today = getTodayKey(timeZone);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const currentUserId = user?.id || appUser?.id;
      if (!currentUserId) {
        setLoading(false);
        return;
      }
      // 1. HABITS
      try {
        const [{ data: habitRows }, { data: completionRows }] = await Promise.all([
          supabase
            .from('habits')
            .select('id, name, frequency, start_date, end_date')
            .eq('user_id', currentUserId),
          supabase
            .from('habit_completions')
            .select('habit_id, completed_on')
            .eq('user_id', currentUserId),
        ]);
        const completionsByHabit = new Map<string, string[]>();
        (completionRows ?? []).forEach((row) => {
          const dates = completionsByHabit.get(row.habit_id) || [];
          if (row.completed_on) dates.push(row.completed_on);
          completionsByHabit.set(row.habit_id, dates);
        });
        const frequencyOrder: Record<string, number> = {
          daily: 0,
          weekly: 1,
          monthly: 2,
          annually: 3,
        };
        const incompleteHabits = (habitRows ?? [])
          .filter((habit) => {
            const startsToday = !habit.start_date || habit.start_date <= today;
            const notEnded = !habit.end_date || habit.end_date >= today;
            if (!startsToday || !notEnded) return false;
            const periodStart = getHabitPeriodStart(today, habit.frequency);
            const completedThisPeriod = (completionsByHabit.get(habit.id) || [])
              .some((completedOn) => completedOn >= periodStart && completedOn <= today);
            return !completedThisPeriod;
          })
          .sort((a, b) => {
            const aFrequency = getHabitFrequencyKey(a.frequency);
            const bFrequency = getHabitFrequencyKey(b.frequency);
            return frequencyOrder[aFrequency] - frequencyOrder[bFrequency];
          });
        setHabitsCount(incompleteHabits.length);
        setHabitItems(
          incompleteHabits.slice(0, 3).map((habit) => {
            const frequency = getHabitFrequencyKey(habit.frequency);
            const label = frequency.charAt(0).toUpperCase() + frequency.slice(1);
            return { text: `${habit.name} (${label})` };
          }),
        );
      } catch (e) {}
      // 2. FINANCES — lifetime totals, not affected by date filters.
      try {
        const { data: txRows, error: txError } = await supabase
          .from('finance_transactions')
          .select('amount, kind')
          .eq('user_id', currentUserId);
        if (txError) throw txError;
        const transactions = txRows ?? [];
        const income = transactions
          .filter((t) => t.kind === 'income')
          .reduce((sum, t) => sum + Number(t.amount || 0), 0);
        const expense = transactions
          .filter((t) => t.kind === 'expense')
          .reduce((sum, t) => sum + Number(t.amount || 0), 0);
        // Debt records store the remaining unpaid balance in amount.
        const outstandingDebt = transactions
          .filter((t) => t.kind === 'debt')
          .reduce((sum, t) => sum + Number(t.amount || 0), 0);
        setFinanceNet(income - expense - outstandingDebt);
      } catch (e) {
        console.log('Error calculating financial health net position:', e);
      }
      // 3. LISTS
      try {
        const { data: checklistRows } = await supabase
          .from('lists')
          .select('id, title, list_type')
          .eq('user_id', currentUserId)
          .eq('list_type', 'checklist')
          .order('created_at', { ascending: true });
        const checklistIds = (checklistRows ?? []).map((l) => l.id);
        if (checklistIds.length > 0) {
          const { data: uncheckedItems } = await supabase
            .from('list_items')
            .select('id, list_id, completed')
            .eq('user_id', currentUserId)
            .eq('completed', false)
            .in('list_id', checklistIds);
          setListsCount(uncheckedItems?.length ?? 0);
          const uncheckedByList = new Map<string, number>();
          (uncheckedItems ?? []).forEach((item) => {
            uncheckedByList.set(item.list_id, (uncheckedByList.get(item.list_id) || 0) + 1);
          });
          const activeChecklists = (checklistRows ?? []).filter(
            (l) => (uncheckedByList.get(l.id) || 0) > 0
          );
          const formattedListPreviews: ListItemPreview[] = activeChecklists.slice(0, 3).map((l) => {
            const count = uncheckedByList.get(l.id) || 0;
            return {
              text: formatListTitleWithCount(l.title, count),
            };
          });
          setListModuleItems(formattedListPreviews);
        } else {
          setListsCount(0);
          setListModuleItems([]);
        }
      } catch (e) {
        console.log('Error loading lists dashboard:', e);
      }
      // 4. REMINDERS
      try {
        const { data: reminderRows } = await supabase
          .from('reminders')
          .select('id, title, due_date, time, completed')
          .eq('user_id', currentUserId)
          .eq('completed', false)
          .order('due_date', { ascending: true });
        if (reminderRows) {
          const overdue = reminderRows.filter((r) => r.due_date && r.due_date < today);
          const dueToday = reminderRows.filter((r) => r.due_date === today);
          const upcoming = reminderRows.filter((r) => r.due_date && r.due_date > today);
          const attentionTotal = overdue.length + dueToday.length;
          setRemindersCount(attentionTotal > 0 ? attentionTotal : upcoming.length);
          if (overdue.length > 0 && dueToday.length > 0) {
            setReminderSubtitle(`${overdue.length} overdue · ${dueToday.length} today`);
          } else if (overdue.length > 0) {
            setReminderSubtitle(`${overdue.length} overdue`);
          } else if (dueToday.length > 0) {
            setReminderSubtitle('Due today');
          } else {
            setReminderSubtitle('Upcoming');
          }
          const prioritized = [...overdue, ...dueToday, ...upcoming];
          setReminderItems(
            prioritized.slice(0, 3).map((r) => {
              const isOverdue = Boolean(r.due_date && r.due_date < today);
              const isToday = r.due_date === today;
              const statusTag = isOverdue
                ? '(Overdue)'
                : isToday
                ? '(Today)'
                : '(Upcoming)';
              return {
                text: `${r.title} ${statusTag}`,
                isOverdue,
              };
            }),
          );
        }
      } catch (e) {
        console.log('Error loading reminders dashboard:', e);
      }
      // 5. BOOKMARKS
      try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const { count } = await supabase
          .from('bookmarks')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', currentUserId)
          .gte('created_at', startOfToday.toISOString());
        setBookmarksCount(count ?? 0);
      } catch (e) {}
      // 6. PLANTS
      try {
        const { data: plantRows } = await supabase
          .from('plants')
          .select('name, last_watered_on, watering_interval_days')
          .eq('user_id', currentUserId);
        if (plantRows) {
          const attentionNeeded: { name: string; isOverdue: boolean; label: string }[] = [];
          plantRows.forEach((p) => {
            const interval = Math.max(1, Number(p.watering_interval_days ?? 7));
            const dueDate = p.last_watered_on ? addDays(p.last_watered_on, interval) : today;
            if (dueDate < today) {
              attentionNeeded.push({
                name: p.name,
                isOverdue: true,
                label: `${p.name} (Overdue)`,
              });
            } else if (dueDate === today) {
              attentionNeeded.push({
                name: p.name,
                isOverdue: false,
                label: `${p.name} (Today)`,
              });
            }
          });
          setPlantsAttentionCount(attentionNeeded.length);
          setPlantItems(
            attentionNeeded.slice(0, 3).map((item) => ({
              text: item.label,
              isOverdue: item.isOverdue,
            })),
          );
        }
      } catch (e) {}
      // 7. WELL-BEING
      try {
        const { data: entries } = await supabase
          .from('wellbeing_entries')
          .select('id')
          .eq('user_id', currentUserId)
          .eq('entry_date', today);
        setWellbeingDone((entries ?? []).length);
      } catch (e) {
        console.log('Error loading wellbeing entries:', e);
      }
      // 8. GAMES
      try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const { count } = await supabase
          .from('game_scores')
          .select('id', { count: 'exact', head: true })
          .eq('player_id', currentUserId)
          .gte('created_at', startOfToday.toISOString());
        setGamesCount(count ?? 0);
      } catch (e) {}
      setLoading(false);
    } catch (err) {
      console.log('Error loading dashboard:', err);
      setLoading(false);
    }
  }, [appUser, timeZone]);
  useFocusEffect(
    useCallback(() => {
      loadProfile();
      loadDashboardData();
    }, [loadProfile, loadDashboardData]),
  );
  const financeDisplay = useMemo(() => {
    const formatted = formatMoney(Math.abs(financeNet), currency_code);
    return financeNet < 0 ? `-${formatted}` : `+${formatted}`;
  }, [financeNet, currency_code]);
  const financeColor = financeNet >= 0 ? '#3E9D66' : '#E05252';
  const folderModules: FolderModuleData[] = [
    {
      key: 'habits',
      title: 'Habits',
      icon: CheckCircle2,
      value: String(habitsCount),
      subtitle: 'habits left today',
      items: habitItems,
      route: '/habits',
    },
    {
      key: 'finances',
      title: 'Finances',
      icon: WalletCards,
      value: financeDisplay,
      valueColor: financeColor,
      subtitle: 'Net position',
      route: '/modules/finances',
    },
    {
      key: 'lists',
      title: 'Lists',
      icon: ListChecks,
      value: String(listsCount),
      subtitle: 'items left to check',
      items: listModuleItems,
      route: '/modules/lists',
    },
    {
      key: 'reminders',
      title: 'Reminder',
      icon: BellRing,
      value: String(remindersCount),
      subtitle: reminderSubtitle,
      items: reminderItems,
      route: '/reminders',
    },
    {
      key: 'bookmarks',
      title: 'Bookmarks',
      icon: Bookmark,
      value: String(bookmarksCount),
      subtitle: 'resources added today',
      route: '/bookmarks',
    },
    {
      key: 'plants',
      title: 'Plants',
      icon: Sprout,
      value: String(plantsAttentionCount),
      subtitle: 'plants need attention',
      items: plantItems,
      route: '/plants',
    },
    {
      key: 'wellbeing',
      title: 'Well-being',
      icon: HeartPulse,
      value: String(wellbeingDone),
      subtitle: 'completed today',
      route: '/modules/wellbeing',
    },
    {
      key: 'games',
      title: 'Games',
      icon: Gamepad2,
      value: String(gamesCount),
      subtitle: 'games played today',
      route: '/modules/games',
    },
  ];
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]}>
      <StatusBar
        barStyle={isAccentPureBlack ? 'light-content' : 'dark-content'}
        backgroundColor={pageBg}
        translucent={false}
      />
      {/* FIXED / STICKY HEADER OUTSIDE SCROLLVIEW */}
      <View style={[styles.headerRowContainer, { backgroundColor: pageBg }]}>
        <View style={styles.headerLeftTextGroup}>
          <Text style={[styles.headerDateTime, { color: headerTextColor }]} numberOfLines={1}>
            {headerDateTime}
          </Text>
          <Text
            style={[styles.headerName, { color: headerTextColor }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
          >
            {userName}!
          </Text>
          <Text style={[styles.headerGreeting, { color: headerTextColor }]}>
            {greeting},
          </Text>
        </View>
        {/* DOOR FRAME: SIDEKICK TALL & FITTING DOOR ALMOST COMPLETELY */}
        <Pressable
          onPress={() => router.push('/profile' as any)}
          style={({ pressed }) => [
            styles.doorFrameWrapper,
            pressed && styles.doorFramePressed,
          ]}
        >
          {/* HARD SHADOW LAYER FOR DOOR */}
          <View style={styles.doorShadowBackdrop} />
          {/* DOOR PORTAL */}
          <View style={styles.doorPortal}>
            <View style={styles.doorTrimArch} />
            <View style={styles.peekingAvatarWrapper}>
              <View style={styles.avatarFlipContainer}>
                <SidekickAvatar
                  sidekickId={sidekick_id || 'sidekick-01'}
                  size={78}
                />
              </View>
            </View>
            <View style={styles.openDoorPanel}>
              <View style={styles.doorKnob} />
            </View>
          </View>
        </Pressable>
      </View>
      {/* SCROLLING GRID */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {folderModules.map((item) => (
            <NeoFolderCard
              key={item.key}
              item={item}
              accentColor={globalAccent}
              loading={loading}
              onPress={() => router.push(item.route as any)}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
/* =========================================================*
*   STYLES: CROSS-PLATFORM HARD SHADOWS & GEOMETRY*
*========================================================= */
const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 36,
  },
  /* HEADER LAYOUT */
  headerRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 5,
    gap: 12,
    zIndex: 10,
  },
  headerLeftTextGroup: {
    flex: 1,
    justifyContent: 'center',
  },
  headerDateTime: {
    fontFamily: FONT_MED,
    fontSize: 9,
    lineHeight: 13,
    letterSpacing: 0.2,
    opacity: 0.75,
    marginBottom: 2,
  },
  headerGreeting: {
    fontFamily: FONT_MED,
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: 0.1,
  },
  headerName: {
    fontFamily: FONT_BOLD,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -0.4,
    marginTop: -1,
  },
  /* DOOR FRAME & CROSS-PLATFORM SHADOW */
  doorFrameWrapper: {
    alignSelf: 'center',
    marginTop: 4,
    width: 72,
    height: 98,
    position: 'relative',
  },
  doorFramePressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  doorShadowBackdrop: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 68,
    height: 94,
    backgroundColor: '#000000',
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  doorPortal: {
    width: 68,
    height: 94,
    backgroundColor: '#000000',
    borderWidth: 2.5,
    borderColor: '#000000',
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  doorTrimArch: {
    position: 'absolute',
    top: 3,
    left: 4,
    right: 4,
    height: 26,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1.5,
    borderColor: '#27272A',
    zIndex: 1,
  },
  peekingAvatarWrapper: {
    position: 'absolute',
    bottom: -4,
    left: -12,
    width: 78,
    height: 88,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 2,
    transform: [{ rotate: '8deg' }],
  },
  avatarFlipContainer: {
    transform: [{ scaleX: -1 }],
  },
  openDoorPanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 25,
    height: '100%',
    backgroundColor: '#FAFAFA',
    borderLeftWidth: 2.5,
    borderLeftColor: '#000000',
    zIndex: 3,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 3.5,
    transform: [{ skewY: '-3deg' }],
  },
  doorKnob: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#000000',
  },
  /* GRID */
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 1,
  },
  /* FOLDER WRAPPER & CROSS-PLATFORM HARD SHADOW BACKDROP */
  folderWrapper: {
    width: '48.2%',
    position: 'relative',
    marginTop: 10,
    paddingRight: 5,
    paddingBottom: 5,
  },
  folderWrapperPressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  cardShadowBackdrop: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    borderRadius: 16,
    borderTopLeftRadius: 10,
  },
  folderBody: {
    borderRadius: 16,
    borderTopLeftRadius: 10,
    borderWidth: 5,
    padding: 12,
    minHeight: 184,
  },
  folderTab: {
    position: 'absolute',
    top: -9,
    left: 7,
    width: '52%',
    height: 0,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 0,
    borderBottomWidth: 0,
    zIndex: 2,
  },
  /* ROW 1: HEADER (Icon, Title, Arrow) */
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  iconRoundedRect: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 13.5,
    flexShrink: 1,
  },
  /* ROW 2: NUMBER / VALUE */
  cardValue: {
    fontFamily: FONT_BOLD,
    fontSize: 28,
    lineHeight: 34,
  },
  /* ROW 3: SUBTITLE */
  cardSubtitle: {
    fontFamily: FONT_MED,
    fontSize: 10.5,
    marginTop: 1,
    marginBottom: 8,
  },
  /* ROW 4: LIST ITEMS */
  listSection: {
    marginTop: 4,
    gap: 3,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  listArrow: {
    fontFamily: FONT_BOLD,
    fontSize: 9,
    lineHeight: 13,
  },
  listItemText: {
    fontSize: 9,
    lineHeight: 13,
    flex: 1,
  },
  shadowRow: {
    marginTop: 1,
  },
  /* AFFIRMATION FOOTER */
  cardAffirmation: {
    marginTop: 6,
    fontFamily: FONT_BOLD,
    fontSize: 9.5,
    lineHeight: 13.5,
  },
});
