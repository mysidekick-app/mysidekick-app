import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft, Info, MoreVertical, X } from 'lucide-react-native';

import { useApp } from '@/components/AppProvider';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';

import {
  WellbeingCalendar,
  parseDate,
  todayDate,
} from '@/components/WellbeingCalendar';

/* ------------------------------------------------------------------ */
/* Palettes                                                            */
/* ------------------------------------------------------------------ */
const DARK_PALETTE = {
  bg: '#090909',
  card: '#121212',
  cardBorder: '#000000',
  text: '#FFFFFF',
  muted: '#A1A1AA',
  divider: '#262626',
  danger: '#EF4444',
  inputBg: '#1E1E1E',
};

const LIGHT_PALETTE = {
  bg: '#FBFAF8',
  card: '#FFFFFF',
  cardBorder: '#000000',
  text: '#000000',
  muted: '#52525B',
  divider: '#E4E4E7',
  danger: '#EF4444',
  inputBg: '#F4F4F5',
};

const FONT = 'Poppins-Regular';
const FONT_MEDIUM = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';
const FONT_XB = 'Poppins-ExtraBold';

/* ------------------------------------------------------------------ */
/* The 9 delights                                                      */
/* ------------------------------------------------------------------ */
type DelightKey =
  | 'walking_around'
  | 'fellowship'
  | 'deliciousness'
  | 'transcendence'
  | 'goofing'
  | 'amelioration'
  | 'coitus'
  | 'enthrallment'
  | 'wildcard';

type Delight = {
  key: DelightKey;
  name: string;
  description: string;
  emoji: string;
};

const DELIGHTS: Delight[] = [
  {
    key: 'walking_around',
    name: 'Walking Around',
    description: 'Getting a bit of exercise.',
    emoji: '🚶',
  },
  {
    key: 'fellowship',
    name: 'Fellowship',
    description: 'Spending time with people.',
    emoji: '🤝',
  },
  {
    key: 'deliciousness',
    name: 'Deliciousness',
    description: 'Consuming something tasty.',
    emoji: '🍽️',
  },
  {
    key: 'transcendence',
    name: 'Transcendence',
    description:
      'Feeling like you’ve “leveled up” or reached a state of extreme delight.',
    emoji: '🌟',
  },
  {
    key: 'goofing',
    name: 'Goofing',
    description: 'Having a laugh.',
    emoji: '😂',
  },
  {
    key: 'amelioration',
    name: 'Amelioration',
    description: 'Improving yourself in some way.',
    emoji: '📈',
  },
  {
    key: 'coitus',
    name: 'Coitus',
    description: 'Sexy times.',
    emoji: '🔥',
  },
  {
    key: 'enthrallment',
    name: 'Enthrallment',
    description: 'Reaching a state of intense focus or engagement.',
    emoji: '🎯',
  },
  {
    key: 'wildcard',
    name: 'WILDCARD',
    description: 'Experience any delight not listed above.',
    emoji: '✨',
  },
];

const DELIGHT_BY_KEY = new Map<DelightKey, Delight>(
  DELIGHTS.map((d) => [d.key, d]),
);

const MODULE_KEY = 'delights';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function prettyDateLabel(dateStr: string): string {
  const d = parseDate(dateStr);

  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function shortDateLabel(dateStr: string): string {
  const d = parseDate(dateStr);

  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/* ------------------------------------------------------------------ */
/* Entry row type                                                      */
/* ------------------------------------------------------------------ */
type DelightsEntryRow = {
  id: string;
  delights: DelightKey[] | null;
  content: string | null;
};

/* ================================================================== */
/* Screen                                                              */
/* ================================================================== */
export default function DelightsScreen() {
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

  const today = todayDate();

  const [selectedDate, setSelectedDate] =
    useState<string>(today);

  const [selected, setSelected] =
    useState<Set<DelightKey>>(new Set());

  const [content, setContent] =
    useState<string>('');

  const [loading, setLoading] =
    useState<boolean>(true);

  const [saving, setSaving] =
    useState<boolean>(false);

  const [error, setError] =
    useState<string | null>(null);

  const [saveMsg, setSaveMsg] =
    useState<string | null>(null);

  const [infoOpen, setInfoOpen] =
    useState<boolean>(false);

  const [menuOpen, setMenuOpen] =
    useState<boolean>(false);

  const [allEntryDates, setAllEntryDates] =
    useState<Set<string>>(new Set());

  const [savedEntries, setSavedEntries] =
    useState<
      {
        id: string;
        entry_date: string;
        delights: DelightKey[] | null;
        content: string | null;
      }[]
    >([]);

  const isFuture = useMemo(
    () => selectedDate > today,
    [selectedDate, today],
  );

  /* ---------------------------------------------------------------- */
  /* Toggle delight                                                    */
  /* ---------------------------------------------------------------- */
  const toggleDelight = useCallback(
    (key: DelightKey) => {
      setSelected((prev) => {
        const next = new Set(prev);

        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }

        return next;
      });
    },
    [],
  );

  /* ---------------------------------------------------------------- */
  /* Load selected date                                                */
  /* ---------------------------------------------------------------- */
  const loadEntry = useCallback(
    async (dateStr: string) => {
      setLoading(true);
      setError(null);
      setSaveMsg(null);

      if (!user) {
        setError(
          'You must be signed in to use this module.',
        );

        setSelected(new Set());
        setContent('');
        setLoading(false);

        return;
      }

      const {
        data,
        error: fetchErr,
      } = await supabase
        .from('wellbeing_entries')
        .select(
          'id, delights, content',
        )
        .eq('user_id', user.id)
        .eq('module_key', MODULE_KEY)
        .eq('entry_date', dateStr)
        .maybeSingle();

      if (fetchErr) {
        console.error(
          'FAILED DELIGHTS ENTRY LOAD:',
          {
            message: fetchErr.message,
            code: fetchErr.code,
            details: fetchErr.details,
            hint: fetchErr.hint,
            moduleKey: MODULE_KEY,
            dateStr,
            userId: user.id,
          },
        );

        setError(
          `Could not load delights entry: ${fetchErr.message}`,
        );

        setLoading(false);

        return;
      }

      const row =
        data as DelightsEntryRow | null;

      const arr = row?.delights ?? [];

      const valid = Array.isArray(arr)
        ? arr.filter(
            (
              k,
            ): k is DelightKey =>
              DELIGHT_BY_KEY.has(k),
          )
        : [];

      setSelected(new Set(valid));
      setContent(row?.content ?? '');
      setLoading(false);
    },
    [user],
  );

  /* ---------------------------------------------------------------- */
  /* Initial selected-date load                                       */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    loadEntry(selectedDate);
  }, [loadEntry, selectedDate]);

  /* ---------------------------------------------------------------- */
  /* Load entry dates + saved entries                                 */
  /* ---------------------------------------------------------------- */
  const loadEntryDates = useCallback(
    async () => {
      if (!user) {
        setAllEntryDates(new Set());
        setSavedEntries([]);
        return;
      }

      const {
        data,
        error: datesErr,
      } = await supabase
        .from('wellbeing_entries')
        .select(
          'id, entry_date, delights, content',
        )
        .eq('user_id', user.id)
        .eq('module_key', MODULE_KEY)
        .order('entry_date', {
          ascending: false,
        });

      if (datesErr) {
        console.error(
          'FAILED DELIGHTS ENTRY DATES LOAD:',
          {
            message: datesErr.message,
            code: datesErr.code,
            details: datesErr.details,
            hint: datesErr.hint,
          },
        );

        return;
      }

      if (data) {
        setAllEntryDates(
          new Set(
            data.map(
              (r: {
                entry_date: string;
              }) => r.entry_date,
            ),
          ),
        );

        setSavedEntries(
          data as {
            id: string;
            entry_date: string;
            delights: DelightKey[] | null;
            content: string | null;
          }[],
        );
      }
    },
    [user],
  );

  useEffect(() => {
    loadEntryDates();
  }, [loadEntryDates]);

  /* ---------------------------------------------------------------- */
  /* Date selection                                                    */
  /* ---------------------------------------------------------------- */
  const onSelectDate = useCallback(
    (date: string) => {
      if (date > today) {
        return;
      }

      setSelectedDate(date);
    },
    [today],
  );

  /* ---------------------------------------------------------------- */
  /* Save                                                              */
  /* ---------------------------------------------------------------- */
  const onSave = useCallback(
    async () => {
      if (isFuture) {
        setSaveMsg(
          'You cannot save an entry for a future date.',
        );

        return;
      }

      if (!user) {
        setError(
          'You must be signed in to save your delights.',
        );

        return;
      }

      if (selected.size === 0) {
        setSaveMsg(
          'Pick at least one delight before saving.',
        );

        return;
      }

      setSaving(true);
      setSaveMsg(null);
      setError(null);

      const {
        error: upsertErr,
      } = await supabase
        .from('wellbeing_entries')
        .upsert(
          {
            user_id: user.id,
            module_key: MODULE_KEY,
            entry_date: selectedDate,
            delights: Array.from(selected),
            content,
          },
          {
            onConflict:
              'user_id,module_key,entry_date',
          },
        );

      if (upsertErr) {
        console.error(
          'FAILED DELIGHTS SAVE:',
          {
            message: upsertErr.message,
            code: upsertErr.code,
            details: upsertErr.details,
            hint: upsertErr.hint,
            moduleKey: MODULE_KEY,
            selectedDate,
            userId: user.id,
          },
        );

        setError(
          `Could not save your delights: ${upsertErr.message}`,
        );
      } else {
        setSaveMsg('Saved.');
        setError(null);

        await loadEntry(selectedDate);
        await loadEntryDates();
      }

      setSaving(false);
    },
    [
      content,
      isFuture,
      selected,
      selectedDate,
      user,
      loadEntry,
      loadEntryDates,
    ],
  );

  const selectedCount = selected.size;

  /* ---------------------------------------------------------------- */
  /* Settings                                                          */
  /* ---------------------------------------------------------------- */
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
          DELIGHTS
        </Text>

        <Pressable
          onPress={() =>
            setMenuOpen((prev) => !prev)
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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={
            styles.scroll
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={
            false
          }
        >
          {/* Date */}
          <Text
            style={[
              styles.dateLabel,
              { color: '#000000' },
            ]}
          >
            {prettyDateLabel(selectedDate)}
          </Text>

          {/* Calendar with forced white background container */}
          <View style={styles.cardContainer}>
            <View style={styles.cardShadowBackdrop} />
            <View style={[styles.calendarCardWrapper, { backgroundColor: '#FFFFFF', borderColor: '#000000' }]}>
              <WellbeingCalendar
                selectedDate={selectedDate}
                onSelectDate={
                  onSelectDate
                }
                accent={accent}
                isDark={false}
                entryDates={
                  allEntryDates
                }
              />
            </View>
          </View>

          {/* Future notice */}
          {isFuture ? (
            <View style={styles.cardContainer}>
              <View style={styles.cardShadowBackdrop} />
              <View
                style={[
                  styles.futureNotice,
                  { backgroundColor: '#FEE2E2', borderColor: '#000000' },
                ]}
              >
                <Text
                  style={
                    styles.futureText
                  }
                >
                  You can only log
                  delights for today
                  or earlier. Pick a
                  past date to continue.
                </Text>
              </View>
            </View>
          ) : null}

          {/* Loading / error / selector */}
          {loading ? (
            <View
              style={styles.centerState}
            >
              <ActivityIndicator
                size="large"
                color="#000000"
              />

              <Text
                style={[styles.stateText, { color: '#000000' }]}
              >
                Loading your entry…
              </Text>
            </View>
          ) : error ? (
            <View style={styles.cardContainer}>
              <View style={styles.cardShadowBackdrop} />
              <View
                style={[
                  styles.centerStateCard,
                  { backgroundColor: '#FEE2E2', borderColor: '#000000' },
                ]}
              >
                <Text
                  style={styles.errorText}
                >
                  {error}
                </Text>

                <Pressable
                  onPress={() =>
                    loadEntry(
                      selectedDate,
                    )
                  }
                  style={({ pressed }) => [
                    styles.retryBtn,
                    { backgroundColor: '#000000', borderColor: '#000000' },
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <Text
                    style={[
                      styles.retryText,
                      {
                        color: '#FFFFFF',
                      },
                    ]}
                  >
                    Retry
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              {/* Delights grid */}
              <View style={styles.cardContainer}>
                <View style={styles.cardShadowBackdrop} />
                <View
                  style={[
                    styles.selectorCard,
                    { backgroundColor: COLORS.card, borderColor: '#000000' },
                  ]}
                >
                  <View
                    style={
                      styles.selectorHeader
                    }
                  >
                    <View
                      style={{ flex: 1 }}
                    >
                      <Text
                        style={
                          styles.selectorEyebrow
                        }
                      >
                        THE 9 DELIGHTS
                      </Text>

                      <Text
                        style={[
                          styles.selectorHint,
                          { color: COLORS.muted },
                        ]}
                      >
                        Tap every delight
                        you experienced
                        today.
                      </Text>
                    </View>

                    {/* Info icon */}
                    <Pressable
                      onPress={() =>
                        setInfoOpen(true)
                      }
                      hitSlop={10}
                      accessibilityLabel="About the 9 delights"
                      style={({ pressed }) => [
                        styles.gridInfoBtn,
                        { backgroundColor: COLORS.inputBg, borderColor: '#000000' },
                        pressed && styles.pressedBtn,
                      ]}
                    >
                      <Info
                        color={COLORS.text}
                        size={17}
                        strokeWidth={2.5}
                      />
                    </Pressable>
                  </View>

                  <View
                    style={styles.chipGrid}
                  >
                    {DELIGHTS.map((d) => {
                      const isSelected =
                        selected.has(
                          d.key,
                        );

                      return (
                        <View
                          key={d.key}
                          style={
                            styles.chipCell
                          }
                        >
                          <Pressable
                            onPress={() =>
                              !isFuture &&
                              toggleDelight(
                                d.key,
                              )
                            }
                            disabled={
                              isFuture
                            }
                            style={({
                              pressed,
                            }) => [
                              styles.chipBtn,
                              {
                                backgroundColor: isSelected ? accent : COLORS.inputBg,
                                borderColor: '#000000',
                              },
                              isFuture &&
                                styles.chipDisabled,
                              pressed &&
                                styles.pressedBtn,
                            ]}
                            accessibilityLabel={`Delight: ${d.name}`}
                            accessibilityRole="button"
                          >
                            <Text
                              style={
                                styles.chipEmoji
                              }
                            >
                              {d.emoji}
                            </Text>

                            <Text
                              style={[
                                styles.chipLabel,
                                { color: isSelected ? '#000000' : COLORS.muted },
                              ]}
                              numberOfLines={1}
                            >
                              {d.name.toUpperCase()}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>

                  {selectedCount > 0 ? (
                    <View
                      style={[
                        styles.selectedSummary,
                        { borderTopColor: COLORS.divider },
                      ]}
                    >
                      <Text
                        style={[
                          styles.selectedText,
                          { color: COLORS.text },
                        ]}
                      >
                        {selectedCount} delight
                        {selectedCount === 1
                          ? ''
                          : 's'}{' '}
                        selected.
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Notes */}
              <View style={styles.cardContainer}>
                <View style={styles.cardShadowBackdrop} />
                <View
                  style={[
                    styles.editorCard,
                    { backgroundColor: COLORS.card, borderColor: '#000000' },
                  ]}
                >
                  <Text
                    style={
                      styles.editorEyebrow
                    }
                  >
                    NOTES
                  </Text>

                  <TextInput
                    value={content}
                    onChangeText={
                      setContent
                    }
                    placeholder="Add a note about your delights…"
                    placeholderTextColor={
                      COLORS.muted
                    }
                    multiline
                    autoFocus={false}
                    editable={!isFuture}
                    style={[
                      styles.editor,
                      { color: COLORS.text },
                      isFuture &&
                        styles.editorDisabled,
                    ]}
                    textAlignVertical="top"
                  />
                </View>
              </View>

              {/* Save feedback */}
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

              {/* Save */}
              <View style={styles.cardContainer}>
                <View style={styles.cardShadowBackdrop} />
                <Pressable
                  onPress={onSave}
                  disabled={
                    saving ||
                    isFuture ||
                    selected.size === 0
                  }
                  style={({ pressed }) => [
                    styles.saveBtn,
                    {
                      backgroundColor: '#000000',
                      borderColor: '#000000',
                    },
                    (saving ||
                      isFuture ||
                      selected.size === 0) &&
                      styles.saveBtnDisabled,
                    pressed &&
                      styles.pressedBtn,
                  ]}
                >
                  {saving ? (
                    <ActivityIndicator
                      size="small"
                      color="#FFFFFF"
                    />
                  ) : (
                    <Text
                      style={[
                        styles.saveBtnText,
                        {
                          color: '#FFFFFF',
                        },
                      ]}
                    >
                      SAVE DELIGHTS
                    </Text>
                  )}
                </Pressable>
              </View>
            </>
          )}

          {/* Saved entries */}
          {savedEntries.length > 0 && (
            <View style={styles.cardContainer}>
              <View style={styles.cardShadowBackdrop} />
              <View
                style={[
                  styles.savedCard,
                  { backgroundColor: COLORS.card, borderColor: '#000000' },
                ]}
              >
                <Text
                  style={styles.savedTitle}
                >
                  SAVED DELIGHTS
                </Text>

                {savedEntries.map(
                  (entry) => {
                    const dlights =
                      (
                        entry.delights ??
                        []
                      ).filter(
                        (
                          k,
                        ): k is DelightKey =>
                          DELIGHT_BY_KEY.has(
                            k,
                          ),
                      );

                    return (
                      <Pressable
                        key={entry.id}
                        onPress={() =>
                          onSelectDate(
                            entry.entry_date,
                          )
                        }
                        style={({
                          pressed,
                        }) => [
                          styles.savedRow,
                          { borderBottomColor: COLORS.divider },
                          pressed &&
                            styles.savedRowPressed,
                        ]}
                      >
                        <View
                          style={[
                            styles.savedDot,
                            { backgroundColor: accent },
                          ]}
                        />

                        <View
                          style={{
                            flex: 1,
                          }}
                        >
                          <Text
                            style={[
                              styles.savedDate,
                              { color: COLORS.text },
                            ]}
                          >
                            {shortDateLabel(
                              entry.entry_date,
                            )}
                          </Text>

                          <Text
                            style={[
                              styles.savedDelights,
                              { color: COLORS.muted },
                            ]}
                            numberOfLines={1}
                          >
                            {dlights.length >
                            0
                              ? dlights
                                  .map(
                                    (k) =>
                                      DELIGHT_BY_KEY.get(
                                        k,
                                      )?.emoji,
                                  )
                                  .join(
                                    ' ',
                                  )
                              : 'No delights'}
                          </Text>

                          {entry.content ? (
                            <Text
                              style={[
                                styles.savedContent,
                                { color: COLORS.muted },
                              ]}
                              numberOfLines={1}
                            >
                              {entry.content}
                            </Text>
                          ) : null}
                        </View>

                        <Text
                          style={[
                            styles.savedEdit,
                            {
                              color: '#000000',
                            },
                          ]}
                        >
                          EDIT
                        </Text>
                      </Pressable>
                    );
                  },
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Info bottom sheet */}
      <Modal
        visible={infoOpen}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setInfoOpen(false)
        }
      >
        <View
          style={
            styles.sheetOverlay
          }
        >
          <Pressable
            style={
              StyleSheet.absoluteFill
            }
            onPress={() =>
              setInfoOpen(false)
            }
            accessibilityLabel="Close info sheet"
          />

          <View style={styles.sheetCardWrapper}>
            <View style={styles.sheetShadowBackdrop} />
            <View
              style={[
                styles.sheetCard,
                { backgroundColor: COLORS.card, borderColor: '#000000' },
              ]}
            >
              <View
                style={[
                  styles.sheetHeader,
                  { borderBottomColor: COLORS.divider },
                ]}
              >
                <Text
                  style={[
                    styles.sheetTitle,
                    { color: COLORS.text },
                  ]}
                >
                  THE 9 DELIGHTS
                </Text>

                <Pressable
                  onPress={() =>
                    setInfoOpen(false)
                  }
                  style={({ pressed }) => [
                    styles.sheetCloseBtn,
                    { backgroundColor: COLORS.inputBg, borderColor: '#000000' },
                    pressed && styles.pressedBtn,
                  ]}
                  hitSlop={12}
                  accessibilityLabel="Close"
                >
                  <X
                    color={COLORS.text}
                    size={20}
                    strokeWidth={2.5}
                  />
                </Pressable>
              </View>

              <ScrollView
                style={
                  styles.sheetScroll
                }
                contentContainerStyle={
                  styles.sheetScrollContent
                }
                showsVerticalScrollIndicator={
                  false
                }
              >
                {DELIGHTS.map((d) => (
                  <View
                    key={d.key}
                    style={[
                      styles.sheetRow,
                      { borderBottomColor: COLORS.divider },
                    ]}
                  >
                    <Text
                      style={
                        styles.sheetEmoji
                      }
                    >
                      {d.emoji}
                    </Text>

                    <View
                      style={{ flex: 1 }}
                    >
                      <Text
                        style={[
                          styles.sheetName,
                          { color: COLORS.text },
                        ]}
                      >
                        {d.name}
                      </Text>

                      <Text
                        style={[
                          styles.sheetDesc,
                          { color: COLORS.muted },
                        ]}
                      >
                        {d.description}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
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

    menuItemPressed: {
      opacity: 0.6,
    },

    menuItemText: {
      fontFamily: FONT_BOLD,
      fontSize: 13,
    },

    scroll: {
      padding: 18,
      paddingBottom: 100,
    },

    dateLabel: {
      fontFamily: FONT_XB,
      fontSize: 14,
      letterSpacing: 0.5,
      marginBottom: 14,
      textTransform: 'uppercase',
    },

    cardContainer: {
      position: 'relative',
      width: '100%',
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

    calendarCardWrapper: {
      borderRadius: 16,
      borderWidth: 3,
      padding: 12,
      overflow: 'hidden',
    },

    futureNotice: {
      borderWidth: 3,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },

    futureText: {
      fontFamily: FONT_BOLD,
      fontSize: 13,
      lineHeight: 18,
      color: '#DC2626',
    },

    selectorCard: {
      borderWidth: 3,
      borderRadius: 16,
      padding: 16,
    },

    selectorHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 16,
    },

    selectorEyebrow: {
      fontFamily: FONT_XB,
      fontSize: 11,
      letterSpacing: 1.3,
      color: C.muted,
      marginBottom: 4,
    },

    selectorHint: {
      fontFamily: FONT,
      fontSize: 12.5,
      lineHeight: 17,
    },

    gridInfoBtn: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      marginTop: 2,
    },

    chipGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -5,
    },

    chipCell: {
      width: '33.3333%',
      paddingHorizontal: 5,
      paddingVertical: 5,
    },

    chipBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 6,
      gap: 6,
    },

    chipDisabled: {
      opacity: 0.4,
    },

    chipEmoji: {
      fontSize: 24,
      lineHeight: 28,
    },

    chipLabel: {
      fontFamily: FONT_XB,
      fontSize: 9,
      letterSpacing: 0.6,
      textAlign: 'center',
    },

    selectedSummary: {
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 2,
    },

    selectedText: {
      fontFamily: FONT_MEDIUM,
      fontSize: 13,
      textAlign: 'center',
    },

    editorCard: {
      borderWidth: 3,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 16,
      minHeight: 160,
    },

    editorEyebrow: {
      fontFamily: FONT_XB,
      fontSize: 11,
      letterSpacing: 1.3,
      color: C.muted,
      marginBottom: 10,
    },

    editor: {
      fontFamily: FONT,
      fontSize: 15,
      lineHeight: 22,
      minHeight: 100,
      padding: 0,
    },

    editorDisabled: {
      opacity: 0.5,
    },

    saveMsg: {
      fontFamily: FONT_XB,
      fontSize: 13,
      marginTop: 12,
      textAlign: 'center',
    },

    saveBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      borderRadius: 16,
      borderWidth: 3,
    },

    saveBtnDisabled: {
      opacity: 0.45,
    },

    saveBtnText: {
      fontFamily: FONT_XB,
      fontSize: 15,
      letterSpacing: 1.2,
    },

    centerState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 56,
      gap: 14,
    },

    centerStateCard: {
      borderWidth: 3,
      borderRadius: 16,
      padding: 24,
      alignItems: 'center',
      gap: 14,
    },

    stateText: {
      fontFamily: FONT_BOLD,
      fontSize: 14,
      textAlign: 'center',
    },

    errorText: {
      fontFamily: FONT_BOLD,
      fontSize: 13.5,
      color: '#DC2626',
      textAlign: 'center',
      lineHeight: 19,
    },

    retryBtn: {
      paddingHorizontal: 22,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 2,
    },

    retryText: {
      fontFamily: FONT_XB,
      fontSize: 13,
    },

    sheetOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingHorizontal: 16,
      paddingBottom: 24,
    },

    sheetCardWrapper: {
      position: 'relative',
      width: '100%',
      maxHeight: '82%',
    },

    sheetShadowBackdrop: {
      position: 'absolute',
      top: 6,
      left: 6,
      right: -6,
      bottom: -6,
      backgroundColor: '#000000',
      borderRadius: 22,
    },

    sheetCard: {
      borderRadius: 22,
      borderWidth: 3,
      overflow: 'hidden',
    },

    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingVertical: 16,
      borderBottomWidth: 2,
    },

    sheetTitle: {
      fontFamily: FONT_XB,
      fontSize: 16,
      letterSpacing: 1.3,
    },

    sheetCloseBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
    },

    sheetScroll: {
      flexShrink: 1,
    },

    sheetScrollContent: {
      paddingHorizontal: 18,
      paddingVertical: 12,
      paddingBottom: 36,
    },

    sheetRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
      paddingVertical: 14,
      borderBottomWidth: 1,
    },

    sheetEmoji: {
      fontSize: 24,
      lineHeight: 28,
      width: 34,
      textAlign: 'center',
    },

    sheetName: {
      fontFamily: FONT_XB,
      fontSize: 14,
      marginBottom: 3,
    },

    sheetDesc: {
      fontFamily: FONT,
      fontSize: 12.5,
      lineHeight: 18,
    },

    savedCard: {
      borderWidth: 3,
      borderRadius: 16,
      padding: 16,
    },

    savedTitle: {
      fontFamily: FONT_XB,
      fontSize: 11,
      letterSpacing: 1.3,
      color: C.muted,
      marginBottom: 14,
    },

    savedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
    },

    savedRowPressed: {
      opacity: 0.7,
    },

    savedDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: '#000000',
    },

    savedDate: {
      fontFamily: FONT_BOLD,
      fontSize: 12.5,
    },

    savedDelights: {
      fontFamily: FONT_MEDIUM,
      fontSize: 11,
      marginTop: 2,
    },

    savedContent: {
      fontFamily: FONT,
      fontSize: 11,
      marginTop: 2,
      fontStyle: 'italic',
    },

    savedEdit: {
      fontFamily: FONT_XB,
      fontSize: 10,
      letterSpacing: 0.8,
    },
  });
}