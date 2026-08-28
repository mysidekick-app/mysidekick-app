import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  MoreVertical,
  ChevronLeft,
  Heart,
  Moon,
  Plus,
  Sparkles,
  Sun,
  Wind,
  X,
} from 'lucide-react-native';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';

/* ------------------------------------------------------------------ */
/* Palettes — dark/light, switched at runtime via useApp().isDark       */
/* ------------------------------------------------------------------ */
const DARK_PALETTE = {
  bg: '#090909',
  card: '#151515',
  cardBorder: '#2A2A2A',
  text: '#F4F2EE',
  muted: '#AAA59D',
  dashedBorder: '#3A3A3A',
  sheet: '#121212',
  divider: '#262626',
  toggleOff: '#3A3A3A',
};

const LIGHT_PALETTE = {
  bg: '#FBFAF8',
  card: '#FFFFFF',
  cardBorder: '#ECE9E4',
  text: '#27241F',
  muted: '#8F8A82',
  dashedBorder: '#D5D2CC',
  sheet: '#FFFFFF',
  divider: '#F0EEEA',
  toggleOff: '#D5D2CC',
};

const FONT = 'Poppins-Regular';
const FONT_MEDIUM = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';
const FONT_XB = 'Poppins-ExtraBold';

/* ------------------------------------------------------------------ */
/* Module catalog                                                      */
/* ------------------------------------------------------------------ */
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

const DEFAULTS: { module_key: ModuleKey; enabled: boolean; position: number }[] = [
  { module_key: 'journaling', enabled: true, position: 0 },
  { module_key: 'morning_pages', enabled: false, position: 1 },
  { module_key: 'shadow_work', enabled: false, position: 2 },
  { module_key: 'affirmations', enabled: false, position: 3 },
  { module_key: 'mood_tracker', enabled: true, position: 4 },
  { module_key: 'breathwork', enabled: true, position: 5 },
  { module_key: 'delights', enabled: true, position: 6 },
];

type ModuleRow = {
  module_key: ModuleKey;
  enabled: boolean;
  position: number;
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
export default function WellbeingDashboard() {
  const { isDark, accentForeground, onAccent } = useApp();
  const accent = accentForeground;
  const COLORS = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  const styles = makeStyles(COLORS);

  const [rows, setRows] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // The Well-being tables are user-scoped. Always use the signed-in user's id.
  const [userId, setUserId] = useState<string | null>(null);

  /* ---- load modules, seed defaults on first run ---- */
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

    setUserId(currentUserId);

    const { data, error: fetchErr } = await supabase
      .from('wellbeing_modules')
      .select('module_key, enabled, position')
      .eq('user_id', currentUserId)
      .order('position', { ascending: true });

    if (fetchErr) {
      setError('Your well-being modules could not be loaded.');
      setLoading(false);
      return;
    }

    let list = (data ?? []) as ModuleRow[];

    // First load: table empty -> insert defaults.
    if (list.length === 0) {
      const { data: inserted, error: insertErr } = await supabase
        .from('wellbeing_modules')
        .insert(DEFAULTS.map((row) => ({ ...row, user_id: currentUserId })))
        .select('module_key, enabled, position')
        .order('position', { ascending: true });

      if (insertErr) {
        setError('Your well-being modules could not be initialised.');
        setLoading(false);
        return;
      }
      list = (inserted ?? []) as ModuleRow[];
    }

    setRows(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* ---- upsert a single module toggle ---- */
  const saveToggle = useCallback(
    async (key: ModuleKey, enabled: boolean, position: number) => {
      if (!userId) {
        setError('Your account could not be identified. Please sign in again.');
        return;
      }

      setSavingKey(key);
      const { error: upsertErr } = await supabase
        .from('wellbeing_modules')
        .upsert(
          { user_id: userId, module_key: key, enabled, position },
          { onConflict: 'user_id,module_key' }
        );

      if (upsertErr) {
        setError('Could not save that change. Please try again.');
        // revert local state
        setRows((prev) =>
          prev.map((r) => (r.module_key === key ? { ...r, enabled: !enabled } : r))
        );
      } else {
        setRows((prev) =>
          prev.map((r) => (r.module_key === key ? { ...r, enabled } : r))
        );
      }
      setSavingKey(null);
    },
    [userId]
  );

  /* ---- derive enabled modules for the dashboard grid ---- */
  const enabledModules = useMemo(() => {
    const byKey = new Map(rows.map((r) => [r.module_key, r]));
    return MODULE_CATALOG.filter((m) => byKey.get(m.key)?.enabled).sort((a, b) => {
      const pa = byKey.get(a.key)?.position ?? 0;
      const pb = byKey.get(b.key)?.position ?? 0;
      return pa - pb;
    });
  }, [rows]);

  const rowFor = (key: ModuleKey): ModuleRow | undefined =>
    rows.find((r) => r.module_key === key);

  const openModule = (route: string) => router.push(route as never);

  /* ---- renderers ---- */
  const renderDashboardCard = (m: ModuleDef) => {
    const Icon = m.icon;
    return (
      <Pressable
        key={m.key}
        onPress={() => openModule(m.route)}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <View style={[styles.cardIconWrap, { backgroundColor: accent }]}>
          <Icon color={onAccent} size={26} strokeWidth={2.3} />
        </View>
        <Text style={styles.cardLabel}>{m.label.toUpperCase()}</Text>
      </Pressable>
    );
  };

  const renderAddCard = () => (
    <Pressable
      key="__add__"
      onPress={() => setSheetOpen(true)}
      style={({ pressed }) => [styles.card, styles.cardDashed, pressed && styles.cardPressed]}
    >
      <View style={styles.addIconWrap}>
        <Plus color={COLORS.muted} size={26} strokeWidth={2} />
      </View>
      <Text style={styles.addLabel}>ADD CATEGORY</Text>
    </Pressable>
  );

  const renderDashboardGrid = () => (
    <View style={styles.sectionBlock}>
      <View style={styles.grid}>
        {enabledModules.map(renderDashboardCard)}
        {renderAddCard()}
      </View>
    </View>
  );

  const renderToggleRow = (m: ModuleDef) => {
    const row = rowFor(m.key);
    const enabled = row?.enabled ?? false;
    const position = row?.position ?? 0;
    const Icon = m.icon;
    const isSaving = savingKey === m.key;
    return (
      <View key={m.key} style={styles.toggleRow}>
        <View style={[styles.toggleIconWrap, { backgroundColor: accent }]}> 
          <Icon color={onAccent} size={18} strokeWidth={2.2} />
        </View>
        <Text style={styles.toggleLabel}>{m.label}</Text>
        {isSaving ? (
          <ActivityIndicator size="small" color={COLORS.muted} />
        ) : (
          <Switch
            value={enabled}
            onValueChange={(v) => saveToggle(m.key, v, position)}
            trackColor={{ false: COLORS.toggleOff, true: accent }}
            thumbColor={enabled ? onAccent : COLORS.text}
            ios_backgroundColor={COLORS.toggleOff}
          />
        )}
      </View>
    );
  };

  const renderCategoryList = () => (
    <View style={styles.sheetSection}>
      {MODULE_CATALOG.map(renderToggleRow)}
    </View>
  );

  /* ---------------------------------------------------------------- */
  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: 28 }]}>
        <Pressable onPress={() => router.push('/modules')} style={[styles.headerBtn, { backgroundColor: accent }]} hitSlop={12}>
          <ChevronLeft color="#FFFFFF" size={24} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: accent }]}>WELL-BEING</Text>
        <Pressable
          onPress={() => setMenuOpen(true)}
          style={styles.headerBtn}
          hitSlop={12}
        >
          <MoreVertical color={COLORS.text} size={22} />
        </Pressable>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          style={styles.menuShade}
          onPress={() => setMenuOpen(false)}
        >
          <Pressable
            style={[
              styles.menuCard,
              {
                backgroundColor: COLORS.card,
                borderColor: COLORS.cardBorder,
              },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <Pressable
  onPress={() => {
    setMenuOpen(false);
    router.push('/(tabs)/profile');
  }}
  style={styles.menuItem}
>
              <Text style={[styles.menuItemText, { color: COLORS.text }]}>
                Settings
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={accent} />
            <Text style={styles.stateText}>Loading your well-being modules…</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={load} style={[styles.retryBtn, { backgroundColor: accent }]}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : enabledModules.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.stateText}>
              No modules yet. Add a category to begin your well-being practice.
            </Text>
            <Pressable onPress={() => setSheetOpen(true)} style={[styles.retryBtn, { backgroundColor: accent }]}>
              <Text style={styles.retryText}>Add category</Text>
            </Pressable>
          </View>
        ) : (
          renderDashboardGrid()
        )}
      </ScrollView>

      {/* Add Category bottom sheet */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetOpen(false)} />
        <View style={styles.sheet}>
          {/* sheet header */}
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Add category</Text>
              <Text style={styles.sheetSub}>
                Choose which modules appear on your dashboard.
              </Text>
            </View>
            <Pressable onPress={() => setSheetOpen(false)} hitSlop={12}>
              <X color={COLORS.muted} size={22} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {renderCategoryList()}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles — computed from the active palette                            */
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
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: C.divider,
    },
    headerBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    headerTitle: {
      fontFamily: FONT_XB,
      fontSize: 18,
      letterSpacing: 1.2,
      color: C.text,
    },

    menuShade: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.25)',
      alignItems: 'flex-end',
      paddingTop: 64,
      paddingRight: 12,
    },
    menuCard: {
      borderRadius: 14,
      borderWidth: 1,
      paddingVertical: 6,
      minWidth: 150,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    menuItem: {
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    menuItemText: {
      fontFamily: FONT_MEDIUM,
      fontSize: 14,
    },

    /* Scroll */
    scroll: { padding: 16, paddingBottom: 36 },

    /* Section */
    sectionBlock: { marginBottom: 24 },
    sectionTitle: {
      fontFamily: FONT_BOLD,
      fontSize: 13,
      letterSpacing: 1.4,
      color: C.muted,
      marginBottom: 12,
    },

    /* Grid */
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },

    /* Card — always a 3-column grid on larger screens */
    card: {
      width: '31.5%',
      flexGrow: 0,
      minHeight: 120,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 16,
    },
    cardPressed: { opacity: 0.72 },
    cardIconWrap: {
      width: 48,
      height: 48,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardLabel: {
      fontFamily: FONT_BOLD,
      fontSize: 10,
      letterSpacing: 0.6,
      textAlign: 'center',
      color: C.text,
    },


    /* Dashed add card */
    cardDashed: {
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: C.dashedBorder,
      backgroundColor: 'transparent',
    },
    addIconWrap: {
      width: 46,
      height: 46,
      borderRadius: 14,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: C.dashedBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addLabel: {
      fontFamily: FONT_BOLD,
      fontSize: 10,
      letterSpacing: 0.6,
      color: C.muted,
    },

    /* Center states */
    centerState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      gap: 16,
    },
    stateText: {
      fontFamily: FONT,
      fontSize: 14,
      color: C.muted,
      textAlign: 'center',
      lineHeight: 20,
    },
    errorText: {
      fontFamily: FONT_MEDIUM,
      fontSize: 14,
      color: '#E05252',
      textAlign: 'center',
    },
    retryBtn: {
      paddingHorizontal: 22,
      paddingVertical: 10,
      borderRadius: 14,
    },
    retryText: {
      fontFamily: FONT_BOLD,
      fontSize: 13,
      color: '#FFFFFF',
    },

    /* ---- Bottom sheet ---- */
    sheetBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    sheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: C.sheet,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingTop: 22,
      paddingBottom: 34,
      maxHeight: '82%',
    },
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingHorizontal: 22,
      marginBottom: 18,
    },
    sheetTitle: {
      fontFamily: FONT_BOLD,
      fontSize: 19,
      color: C.text,
    },
    sheetSub: {
      fontFamily: FONT,
      fontSize: 12,
      color: C.muted,
      marginTop: 4,
    },
    sheetScroll: { paddingHorizontal: 22 },
    sheetScrollContent: { paddingBottom: 8 },

    sheetSection: { marginBottom: 22 },
    sheetSectionTitle: {
      fontFamily: FONT_BOLD,
      fontSize: 12,
      letterSpacing: 1.4,
      color: C.muted,
      marginBottom: 10,
    },

    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: C.divider,
    },
    toggleIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toggleLabel: {
      flex: 1,
      fontFamily: FONT_MEDIUM,
      fontSize: 14,
      color: C.text,
    },
  });
}