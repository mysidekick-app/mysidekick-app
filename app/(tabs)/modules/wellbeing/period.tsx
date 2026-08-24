import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { router } from 'expo-router';
import { ChevronLeft, Bell } from 'lucide-react-native';

import { useApp } from '@/components/AppProvider';
import { useAuth } from '@/components/AuthProvider';
import { DatePickerInput } from '@/components/DatePickerInput';
import { supabase } from '@/lib/supabase';

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

/* ------------------------------------------------------------------ */
/* Palettes                                                            */
/* ------------------------------------------------------------------ */

const DARK_PALETTE = {
  bg: '#090909',
  card: '#151515',
  cardBorder: '#2A2A2A',
  text: '#F4F2EE',
  muted: '#AAA59D',
  divider: '#262626',
  danger: '#E05252',
  inputBg: '#1C1C1C',
};

const LIGHT_PALETTE = {
  bg: '#FBFAF8',
  card: '#FFFFFF',
  cardBorder: '#ECE9E4',
  text: '#27241F',
  muted: '#8F8A82',
  divider: '#F0EEEA',
  danger: '#E05252',
  inputBg: '#F5F3EF',
};

const FONT = 'Poppins-Regular';
const FONT_MEDIUM = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';
const FONT_XB = 'Poppins-ExtraBold';

/* ------------------------------------------------------------------ */
/* Cycle information                                                   */
/* ------------------------------------------------------------------ */

type PhaseKey =
  | 'menstrual'
  | 'follicular'
  | 'ovulation'
  | 'luteal';

type PhaseInfo = {
  key: PhaseKey;
  label: string;
  actions: string[];
  foods: string;
  exercise: string;
  pregnancyChance: string;
};

const PHASE_INFO: Record<
  PhaseKey,
  PhaseInfo
> = {
  menstrual: {
    key: 'menstrual',
    label: 'Menstrual Phase',
    actions: [
      'Rest and replenish',
      'Be gentle with yourself',
      'Reflect and journal',
    ],
    foods:
      'Iron-rich foods: spinach, lentils, dark chocolate. Warm foods: soups, ginger tea.',
    exercise:
      'Gentle yoga, walking, stretching. Avoid intense workouts.',
    pregnancyChance: 'Low',
  },

  follicular: {
    key: 'follicular',
    label: 'Follicular Phase',
    actions: [
      'Start new projects',
      'Be social and creative',
      'Try new things',
    ],
    foods:
      'Protein-rich foods: eggs, fish, legumes. Fresh fruits and vegetables.',
    exercise:
      'Strength training, running, group classes. Energy is rising.',
    pregnancyChance: 'Low to moderate',
  },

  ovulation: {
    key: 'ovulation',
    label: 'Ovulation Phase',
    actions: [
      'Lean into social energy',
      'Important conversations',
      'Network and connect',
    ],
    foods:
      'Antioxidant-rich foods: berries, leafy greens. Zinc-rich: pumpkin seeds, oysters.',
    exercise:
      'High-intensity workouts, dancing, team sports. Peak energy.',
    pregnancyChance: 'High — fertile window',
  },

  luteal: {
    key: 'luteal',
    label: 'Luteal Phase',
    actions: [
      'Slow down and nourish',
      'Finish ongoing projects',
      'Practice self-care',
    ],
    foods:
      'Complex carbs: sweet potatoes, oats. Magnesium-rich: dark chocolate, nuts. Avoid excess caffeine.',
    exercise:
      'Moderate exercise: pilates, swimming, hiking. Wind down as energy drops.',
    pregnancyChance: 'Moderate, declining',
  },
};

/* ------------------------------------------------------------------ */
/* Date helpers                                                        */
/* ------------------------------------------------------------------ */

function todayDate(): string {
  const d = new Date();

  return `${d.getFullYear()}-${String(
    d.getMonth() + 1,
  ).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr
    .split('-')
    .map(Number);

  return new Date(
    y,
    (m ?? 1) - 1,
    d ?? 1,
  );
}

function addDays(
  dateStr: string,
  days: number,
): string {
  const d = parseDate(dateStr);

  d.setDate(
    d.getDate() + days,
  );

  return `${d.getFullYear()}-${String(
    d.getMonth() + 1,
  ).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function daysBetween(
  startStr: string,
  endStr: string,
): number {
  return Math.round(
    (
      parseDate(endStr).getTime() -
      parseDate(startStr).getTime()
    ) / 86400000,
  );
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type PeriodSettings = {
  id: string;
  user_id: string;
  cycle_start: string;
  cycle_length: number;
  period_length: number;
  last_period_date: string | null;
};

/* ------------------------------------------------------------------ */
/* Cycle calculations                                                  */
/* ------------------------------------------------------------------ */

function computeCycleDay(
  startStr: string,
  cycleLength: number,
  today: string,
): number {
  const elapsed = daysBetween(
    startStr,
    today,
  );

  if (elapsed < 0) {
    return 1;
  }

  return (
    (elapsed % cycleLength) + 1
  );
}

function computePhase(
  cycleDay: number,
  periodLength: number,
): PhaseKey {
  if (cycleDay <= periodLength) {
    return 'menstrual';
  }

  if (cycleDay <= 14) {
    return 'follicular';
  }

  if (cycleDay <= 16) {
    return 'ovulation';
  }

  return 'luteal';
}

function computeNextPeriodStart(
  startStr: string,
  cycleLength: number,
  today: string,
): string {
  const elapsed = daysBetween(
    startStr,
    today,
  );

  if (elapsed < 0) {
    return startStr;
  }

  const cyclesPassed = Math.floor(
    elapsed / cycleLength,
  );

  return addDays(
    startStr,
    (cyclesPassed + 1) *
      cycleLength,
  );
}

/* ================================================================== */
/* Screen                                                              */
/* ================================================================== */

export default function PeriodTrackerScreen() {
  const {
    isDark,
    accentForeground,
    onAccent,
  } = useApp();

  const { user } = useAuth();

  const accent =
    accentForeground;

  const COLORS = isDark
    ? DARK_PALETTE
    : LIGHT_PALETTE;

  const styles =
    makeStyles(COLORS);

  const today =
    todayDate();

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [settings, setSettings] =
    useState<PeriodSettings | null>(
      null,
    );

  const [editing, setEditing] =
    useState(false);

  const [formStart, setFormStart] =
    useState(today);

  const [
    formLastPeriod,
    setFormLastPeriod,
  ] = useState(today);

  const [formPeriod, setFormPeriod] =
    useState('5');

  const [saving, setSaving] =
    useState(false);

  const [saveMsg, setSaveMsg] =
    useState<string | null>(null);

  const [formError, setFormError] =
    useState<string | null>(null);

  /* ---------------------------------------------------------------- */
  /* Load settings                                                     */
  /* ---------------------------------------------------------------- */

  const loadSettings =
    useCallback(async () => {
      setLoading(true);
      setError(null);

      if (!user) {
        setError(
          'You must be signed in to use Period Tracker.',
        );
        setSettings(null);
        setLoading(false);
        return;
      }

      const {
        data,
        error: fetchErr,
      } = await supabase
        .from(
          'wellbeing_period_settings',
        )
        .select(
          'id, user_id, cycle_start, cycle_length, period_length, last_period_date',
        )
        .eq('user_id', user.id)
        .order('created_at', {
          ascending: true,
        })
        .limit(1)
        .maybeSingle();

      if (fetchErr) {
        console.error(
          'FAILED PERIOD SETTINGS LOAD:',
          {
            message: fetchErr.message,
            code: fetchErr.code,
            details: fetchErr.details,
            hint: fetchErr.hint,
            userId: user.id,
          },
        );

        setError(
          `Could not load your cycle settings: ${fetchErr.message}`,
        );

        setLoading(false);
        return;
      }

      const row =
        data as PeriodSettings | null;

      if (row) {
        setSettings(row);

        setFormStart(
          row.cycle_start,
        );

        setFormLastPeriod(
          row.last_period_date ??
            row.cycle_start,
        );

        setFormPeriod(
          String(
            row.period_length,
          ),
        );
      } else {
        setSettings(null);
      }

      setLoading(false);
    }, [user]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  /* ---------------------------------------------------------------- */
  /* Cycle info                                                        */
  /* ---------------------------------------------------------------- */

  const cycleInfo =
    useMemo(() => {
      if (!settings) {
        return null;
      }

      const cycleDay =
        computeCycleDay(
          settings.cycle_start,
          settings.cycle_length,
          today,
        );

      const phaseKey =
        computePhase(
          cycleDay,
          settings.period_length,
        );

      const phase =
        PHASE_INFO[phaseKey];

      const nextStart =
        computeNextPeriodStart(
          settings.cycle_start,
          settings.cycle_length,
          today,
        );

      const daysUntilNext =
        daysBetween(
          today,
          nextStart,
        );

      return {
        cycleDay,
        phase,
        nextStart,
        daysUntilNext,
      };
    }, [settings, today]);

  /* ---------------------------------------------------------------- */
  /* Auto-calculate cycle length                                       */
  /* ---------------------------------------------------------------- */

  const autoCycleLength =
    useMemo(() => {
      if (
        !formStart ||
        !formLastPeriod
      ) {
        return null;
      }

      const diff =
        daysBetween(
          formLastPeriod,
          formStart,
        );

      return diff > 0 &&
        diff <= 90
        ? diff
        : null;
    }, [
      formStart,
      formLastPeriod,
    ]);

  /* ---------------------------------------------------------------- */
  /* Save settings                                                     */
  /* ---------------------------------------------------------------- */

  const onSave =
    useCallback(async () => {
      setFormError(null);
      setSaveMsg(null);

      if (!user) {
        setFormError(
          'You must be signed in to save your cycle settings.',
        );
        return;
      }

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
          formStart,
        )
      ) {
        setFormError(
          'Enter the cycle start date as YYYY-MM-DD.',
        );
        return;
      }

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
          formLastPeriod,
        )
      ) {
        setFormError(
          'Enter the last period date as YYYY-MM-DD.',
        );
        return;
      }

      const periodLen =
        parseInt(
          formPeriod,
          10,
        );

      if (
        Number.isNaN(periodLen) ||
        periodLen < 1 ||
        periodLen > 14
      ) {
        setFormError(
          'Period length should be between 1 and 14 days.',
        );
        return;
      }

      let cycleLen = 28;

      if (
        autoCycleLength &&
        autoCycleLength >= 10 &&
        autoCycleLength <= 90
      ) {
        cycleLen =
          autoCycleLength;
      } else if (settings) {
        cycleLen =
          settings.cycle_length;
      }

      setSaving(true);

      const payload = {
        user_id: user.id,
        cycle_start: formStart,
        cycle_length: cycleLen,
        period_length: periodLen,
        last_period_date:
          formLastPeriod,
      };

      if (settings) {
        const {
          data,
          error: updateErr,
        } = await supabase
          .from(
            'wellbeing_period_settings',
          )
          .update(payload)
          .eq('id', settings.id)
          .eq('user_id', user.id)
          .select(
            'id, user_id, cycle_start, cycle_length, period_length, last_period_date',
          )
          .single();

        if (updateErr) {
          console.error(
            'FAILED PERIOD SETTINGS UPDATE:',
            {
              message:
                updateErr.message,
              code:
                updateErr.code,
              details:
                updateErr.details,
              hint:
                updateErr.hint,
              userId:
                user.id,
            },
          );

          setFormError(
            `Could not save your settings: ${updateErr.message}`,
          );

          setSaving(false);
          return;
        }

        setSettings(
          data as PeriodSettings,
        );

        setSaveMsg(
          'Settings updated.',
        );
      } else {
        const {
          data,
          error: insertErr,
        } = await supabase
          .from(
            'wellbeing_period_settings',
          )
          .insert(payload)
          .select(
            'id, user_id, cycle_start, cycle_length, period_length, last_period_date',
          )
          .single();

        if (insertErr) {
          console.error(
            'FAILED PERIOD SETTINGS INSERT:',
            {
              message:
                insertErr.message,
              code:
                insertErr.code,
              details:
                insertErr.details,
              hint:
                insertErr.hint,
              userId:
                user.id,
            },
          );

          setFormError(
            `Could not save your settings: ${insertErr.message}`,
          );

          setSaving(false);
          return;
        }

        setSettings(
          data as PeriodSettings,
        );

        setSaveMsg(
          'Settings saved.',
        );
      }

      setEditing(false);
      setSaving(false);
    }, [
      formStart,
      formLastPeriod,
      formPeriod,
      autoCycleLength,
      settings,
      user,
    ]);

  /* ---------------------------------------------------------------- */
  /* Ring data                                                         */
  /* ---------------------------------------------------------------- */

  const cycleProgress =
    useMemo(() => {
      if (
        !settings ||
        !cycleInfo
      ) {
        return 0;
      }

      return (
        cycleInfo.cycleDay /
        settings.cycle_length
      );
    }, [
      settings,
      cycleInfo,
    ]);

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <View style={styles.safe}>
      <View
        style={[
          styles.header,
          { paddingTop: 28 },
        ]}
      >
        <Pressable
          onPress={() =>
            router.push('/modules')
          }
          style={[
            styles.backBtn,
            {
              backgroundColor:
                accent,
            },
          ]}
          hitSlop={12}
        >
          <ChevronLeft
            color="#FFFFFF"
            size={22}
            strokeWidth={2.4}
          />
        </Pressable>

        <Text
          style={styles.headerTitle}
        >
          PERIOD TRACKER
        </Text>

        <Pressable
          style={styles.bellBtn}
          hitSlop={12}
        >
          <Bell
            color={COLORS.text}
            size={20}
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={
          styles.scroll
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <Text
          style={[
            styles.eyebrow,
            { color: accent },
          ]}
        >
          MENSTRUAL CYCLE
        </Text>

        {loading ? (
          <View
            style={
              styles.centerState
            }
          >
            <ActivityIndicator
              size="large"
              color={accent}
            />

            <Text
              style={
                styles.stateText
              }
            >
              Loading your cycle…
            </Text>
          </View>
        ) : error ? (
          <View
            style={
              styles.centerState
            }
          >
            <Text
              style={
                styles.errorText
              }
            >
              {error}
            </Text>

            <Pressable
              onPress={
                loadSettings
              }
              style={[
                styles.retryBtn,
                {
                  backgroundColor:
                    accent,
                },
              ]}
            >
              <Text
                style={[
                  styles.retryText,
                  {
                    color:
                      onAccent,
                  },
                ]}
              >
                Retry
              </Text>
            </Pressable>
          </View>
        ) : !settings || editing ? (
          <View
            style={
              styles.formCard
            }
          >
            <Text
              style={
                styles.formTitle
              }
            >
              {settings
                ? 'EDIT CYCLE'
                : 'SET UP YOUR CYCLE'}
            </Text>

            <Text
              style={
                styles.formHint
              }
            >
              Tell us about your
              cycle so we can track
              it for you.
            </Text>

            <Text
              style={
                styles.fieldLabel
              }
            >
              CYCLE START DATE
            </Text>

            <DatePickerInput
              value={formStart}
              onChange={
                setFormStart
              }
              accent={accent}
              onAccent={onAccent}
              isDark={isDark}
            />

            <Text
              style={
                styles.fieldHint
              }
            >
              The first day of your
              current cycle.
            </Text>

            <Text
              style={
                styles.fieldLabel
              }
            >
              LAST PERIOD DATE
            </Text>

            <DatePickerInput
              value={
                formLastPeriod
              }
              onChange={
                setFormLastPeriod
              }
              accent={accent}
              onAccent={onAccent}
              isDark={isDark}
            />

            <Text
              style={
                styles.fieldHint
              }
            >
              When was your last
              period? We'll auto-calculate
              your cycle length.
            </Text>

            {autoCycleLength && (
              <Text
                style={[
                  styles.autoCalc,
                  { color: accent },
                ]}
              >
                Cycle length:{' '}
                {autoCycleLength}{' '}
                days
              </Text>
            )}

            <Text
              style={
                styles.fieldLabel
              }
            >
              PERIOD LENGTH (DAYS)
            </Text>

            <TextInput
              value={formPeriod}
              onChangeText={
                setFormPeriod
              }
              placeholder="5"
              placeholderTextColor={
                COLORS.muted
              }
              style={styles.input}
              keyboardType="number-pad"
              maxLength={2}
            />

            <Text
              style={
                styles.fieldHint
              }
            >
              How many days your
              period lasts.
            </Text>

            {formError ? (
              <Text
                style={
                  styles.formErrorText
                }
              >
                {formError}
              </Text>
            ) : null}

            {saveMsg ? (
              <Text
                style={[
                  styles.saveMsg,
                  {
                    color:
                      accent,
                  },
                ]}
              >
                {saveMsg}
              </Text>
            ) : null}

            <Pressable
              onPress={onSave}
              disabled={saving}
              style={({
                pressed,
              }) => [
                styles.saveBtn,
                {
                  backgroundColor:
                    accent,
                },
                saving &&
                  styles.saveBtnDisabled,
                pressed &&
                  styles.saveBtnPressed,
              ]}
            >
              {saving ? (
                <ActivityIndicator
                  size="small"
                  color={onAccent}
                />
              ) : (
                <Text
                  style={[
                    styles.saveBtnText,
                    {
                      color:
                        onAccent,
                    },
                  ]}
                >
                  {settings
                    ? 'SAVE CHANGES'
                    : 'SAVE SETTINGS'}
                </Text>
              )}
            </Pressable>

            {settings && editing && (
              <Pressable
                onPress={() => {
                  setEditing(false);
                  setFormError(
                    null,
                  );
                  setSaveMsg(null);
                  setFormStart(
                    settings.cycle_start,
                  );
                  setFormLastPeriod(
                    settings.last_period_date ??
                      settings.cycle_start,
                  );
                  setFormPeriod(
                    String(
                      settings.period_length,
                    ),
                  );
                }}
                style={
                  styles.cancelBtn
                }
              >
                <Text
                  style={
                    styles.cancelBtnText
                  }
                >
                  CANCEL
                </Text>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            <View
              style={
                styles.ringCard
              }
            >
              <View
                style={
                  styles.ringWrap
                }
              >
                <View
                  style={[
                    styles.ringOuter,
                    {
                      borderColor:
                        isDark
                          ? '#3A3A3A'
                          : '#D5D2CC',
                    },
                  ]}
                >
                  <CycleRingProgress
                    progress={
                      cycleProgress
                    }
                    accent={accent}
                  />

                  <View
                    style={
                      styles.ringInner
                    }
                  >
                    <Text
                      style={[
                        styles.ringDay,
                        {
                          color:
                            accent,
                        },
                      ]}
                    >
                      {cycleInfo?.cycleDay ??
                        '—'}
                    </Text>

                    <Text
                      style={
                        styles.ringSub
                      }
                    >
                      day cycle
                    </Text>
                  </View>
                </View>
              </View>

              <Text
                style={[
                  styles.phaseTitle,
                  {
                    color:
                      accent,
                  },
                ]}
              >
                {cycleInfo?.phase.label ??
                  '—'}
              </Text>

              <Text
                style={
                  styles.nextUnderPhase
                }
              >
                NEXT PERIOD START:{' '}
                {cycleInfo
                  ? cycleInfo.daysUntilNext >
                    0
                    ? `${cycleInfo.daysUntilNext} day${
                        cycleInfo.daysUntilNext ===
                        1
                          ? ''
                          : 's'
                      }`
                    : 'today'
                  : '—'}
              </Text>
            </View>

            <View
              style={
                styles.actionsCard
              }
            >
              <Text
                style={
                  styles.actionsEyebrow
                }
              >
                ACTIONS YOU CAN TAKE
              </Text>

              {cycleInfo?.phase.actions.map(
                (
                  action,
                  i,
                ) => (
                  <View
                    key={i}
                    style={
                      styles.actionRow
                    }
                  >
                    <View
                      style={[
                        styles.actionDot,
                        {
                          backgroundColor:
                            accent,
                        },
                      ]}
                    />

                    <Text
                      style={
                        styles.actionText
                      }
                    >
                      {action}
                    </Text>
                  </View>
                ),
              )}

              <View
                style={
                  styles.actionSection
                }
              >
                <Text
                  style={
                    styles.actionSubLabel
                  }
                >
                  SUGGESTED FOODS
                </Text>

                <Text
                  style={
                    styles.actionBody
                  }
                >
                  {cycleInfo?.phase.foods}
                </Text>
              </View>

              <View
                style={
                  styles.actionSection
                }
              >
                <Text
                  style={
                    styles.actionSubLabel
                  }
                >
                  SUGGESTED EXERCISE
                </Text>

                <Text
                  style={
                    styles.actionBody
                  }
                >
                  {cycleInfo?.phase.exercise}
                </Text>
              </View>

              <View
                style={
                  styles.actionSection
                }
              >
                <Text
                  style={
                    styles.actionSubLabel
                  }
                >
                  CHANCE OF PREGNANCY
                </Text>

                <Text
                  style={[
                    styles.actionBody,
                    {
                      color:
                        accent,
                      fontFamily:
                        FONT_SEMI,
                    },
                  ]}
                >
                  {
                    cycleInfo?.phase
                      .pregnancyChance
                  }
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => {
                setEditing(true);
                setSaveMsg(null);
                setFormError(null);

                if (settings) {
                  setFormStart(
                    settings.cycle_start,
                  );

                  setFormLastPeriod(
                    settings.last_period_date ??
                      settings.cycle_start,
                  );

                  setFormPeriod(
                    String(
                      settings.period_length,
                    ),
                  );
                }
              }}
              style={({
                pressed,
              }) => [
                styles.editBtn,
                {
                  borderColor:
                    accent,
                },
                pressed &&
                  styles.editBtnPressed,
              ]}
            >
              <Text
                style={[
                  styles.editBtnText,
                  {
                    color:
                      accent,
                  },
                ]}
              >
                EDIT CYCLE
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

type Palette =
  typeof DARK_PALETTE;

function makeStyles(C: Palette) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor:
        C.bg,
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor:
        C.divider,
    },

    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent:
        'center',
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
      justifyContent:
        'center',
    },

    scroll: {
      padding: 20,
      paddingBottom: 48,
    },

    eyebrow: {
      fontFamily: FONT_SEMI,
      fontSize: 13,
      letterSpacing: 0.4,
      marginBottom: 18,
      textTransform:
        'uppercase',
    },

    centerState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 56,
      gap: 14,
    },

    stateText: {
      fontFamily: FONT,
      fontSize: 13.5,
      color: C.muted,
      textAlign: 'center',
    },

    errorText: {
      fontFamily: FONT_MEDIUM,
      fontSize: 13.5,
      color: C.danger,
      textAlign: 'center',
      lineHeight: 19,
    },

    retryBtn: {
      paddingHorizontal: 22,
      paddingVertical: 10,
      borderRadius: 12,
    },

    retryText: {
      fontFamily: FONT_BOLD,
      fontSize: 12.5,
    },

    formCard: {
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor:
        C.cardBorder,
      borderRadius: 16,
      padding: 18,
    },

    formTitle: {
      fontFamily: FONT_BOLD,
      fontSize: 11,
      letterSpacing: 1.3,
      color: C.muted,
      marginBottom: 6,
    },

    formHint: {
      fontFamily: FONT,
      fontSize: 12.5,
      color: C.muted,
      marginBottom: 18,
      lineHeight: 17,
    },

    fieldLabel: {
      fontFamily: FONT_BOLD,
      fontSize: 10.5,
      letterSpacing: 1,
      color: C.muted,
      marginTop: 4,
      marginBottom: 6,
    },

    fieldHint: {
      fontFamily: FONT,
      fontSize: 11,
      color: C.muted,
      marginTop: 4,
      marginBottom: 12,
      lineHeight: 15,
    },

    autoCalc: {
      fontFamily: FONT_SEMI,
      fontSize: 12,
      marginTop: 4,
      marginBottom: 12,
    },

    input: {
      fontFamily: FONT_MEDIUM,
      fontSize: 14,
      color: C.text,
      backgroundColor:
        C.inputBg,
      borderWidth: 1,
      borderColor:
        C.cardBorder,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },

    formErrorText: {
      fontFamily: FONT_MEDIUM,
      fontSize: 12.5,
      color: C.danger,
      marginTop: 4,
      marginBottom: 4,
      lineHeight: 18,
    },

    saveMsg: {
      fontFamily: FONT_SEMI,
      fontSize: 12.5,
      marginTop: 10,
      textAlign: 'center',
    },

    saveBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 15,
      borderRadius: 14,
      marginTop: 14,
    },

    saveBtnDisabled: {
      opacity: 0.45,
    },

    saveBtnPressed: {
      opacity: 0.82,
    },

    saveBtnText: {
      fontFamily: FONT_BOLD,
      fontSize: 13,
      letterSpacing: 1.2,
    },

    cancelBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 13,
      borderRadius: 14,
      marginTop: 8,
      borderWidth: 1,
      borderColor:
        C.cardBorder,
    },

    cancelBtnText: {
      fontFamily: FONT_BOLD,
      fontSize: 12.5,
      letterSpacing: 1,
      color: C.muted,
    },

    ringCard: {
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor:
        C.cardBorder,
      borderRadius: 16,
      padding: 24,
      alignItems: 'center',
      marginBottom: 14,
    },

    ringWrap: {
      alignItems: 'center',
      justifyContent:
        'center',
      marginBottom: 16,
    },

    ringOuter: {
      width: 180,
      height: 180,
      borderRadius: 90,
      alignItems: 'center',
      justifyContent:
        'center',
      borderWidth: 3,
    },

    ringInner: {
      alignItems: 'center',
      justifyContent:
        'center',
    },

    ringDay: {
      fontFamily: FONT_XB,
      fontSize: 48,
      lineHeight: 54,
    },

    ringSub: {
      fontFamily: FONT,
      fontSize: 12,
      color: C.muted,
      marginTop: 2,
    },

    phaseTitle: {
      fontFamily: FONT_SEMI,
      fontSize: 16,
      textAlign: 'center',
    },

    nextUnderPhase: {
      fontFamily: FONT_BOLD,
      fontSize: 11,
      letterSpacing: 1,
      color: C.muted,
      marginTop: 10,
      textAlign: 'center',
    },

    actionsCard: {
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor:
        C.cardBorder,
      borderRadius: 16,
      padding: 18,
      marginBottom: 14,
    },

    actionsEyebrow: {
      fontFamily: FONT_BOLD,
      fontSize: 10.5,
      letterSpacing: 1.3,
      color: C.muted,
      marginBottom: 14,
    },

    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 6,
    },

    actionDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },

    actionText: {
      fontFamily: FONT_MEDIUM,
      fontSize: 14,
      color: C.text,
    },

    actionSection: {
      marginTop: 14,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor:
        C.divider,
    },

    actionSubLabel: {
      fontFamily: FONT_BOLD,
      fontSize: 10,
      letterSpacing: 1,
      color: C.muted,
      marginBottom: 6,
    },

    actionBody: {
      fontFamily: FONT,
      fontSize: 13,
      color: C.text,
      lineHeight: 19,
    },

    editBtn: {
      alignItems: 'center',
      justifyContent:
        'center',
      paddingVertical: 15,
      borderRadius: 14,
      borderWidth: 1.5,
    },

    editBtnPressed: {
      opacity: 0.82,
    },

    editBtnText: {
      fontFamily: FONT_BOLD,
      fontSize: 13,
      letterSpacing: 1.2,
    },
  });
}

/* ------------------------------------------------------------------ */
/* Cycle ring progress                                                */
/* ------------------------------------------------------------------ */

const RING_SIZE = 180;
const RING_STROKE = 8;
const RING_RADIUS =
  (RING_SIZE - RING_STROKE) / 2;

function CycleRingProgress({
  progress,
  accent,
}: {
  progress: number;
  accent: string;
}) {
  const clamped =
    Math.max(
      0,
      Math.min(1, progress),
    );

  const animatedProgress =
    useSharedValue(0);

  useEffect(() => {
    animatedProgress.value =
      withTiming(clamped, {
        duration: 800,
        easing: Easing.out(
          Easing.cubic,
        ),
      });
  }, [
    clamped,
    animatedProgress,
  ]);

  const ringStyle =
    useAnimatedStyle(() => {
      return {
        opacity:
          animatedProgress.value,
      };
    });

  return (
    <View
      style={
        cycleStyles.container
      }
      pointerEvents="none"
    >
      <Animated.View
        style={[
          cycleStyles.ringFill,
          {
            borderColor:
              accent,
          },
          ringStyle,
        ]}
      />
    </View>
  );
}

const cycleStyles =
  StyleSheet.create({
    container: {
      position: 'absolute',
      width: RING_SIZE,
      height: RING_SIZE,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    ringFill: {
      position: 'absolute',
      width: RING_SIZE,
      height: RING_SIZE,
      borderRadius:
        RING_SIZE / 2,
      borderWidth:
        RING_STROKE,
      borderColor:
        'transparent',
      borderStyle: 'dashed',
    },
  });