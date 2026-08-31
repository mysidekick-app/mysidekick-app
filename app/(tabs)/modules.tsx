import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import {
  CalendarDays,
  CheckCircle2,
  WalletCards,
  ListChecks,
  BellRing,
  Bookmark,
  Sprout,
  HeartPulse,
  Gamepad2,
  UsersRound,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Settings,
  LogOut,
} from 'lucide-react-native';

import { useState } from 'react';

import { useApp } from '@/components/AppProvider';

import { router } from 'expo-router';

/* =========================================================
   TYPES
========================================================= */

type Module = {
  label: string;
  icon: typeof WalletCards;
  route?: string;
};

/* =========================================================
   MODULES
========================================================= */

const modules: Module[] = [
  {
    label: 'Planner',
    icon: CalendarDays,
    route: '/planner',
  },
  {
    label: 'Habits',
    icon: CheckCircle2,
    route: '/habits',
  },
  {
    label: 'Finances',
    icon: WalletCards,
    route: '/modules/finances',
  },
  {
    label: 'Lists',
    icon: ListChecks,
    route: '/modules/lists',
  },
  {
    label: 'Reminders',
    icon: BellRing,
    route: '/reminders',
  },
  {
    label: 'Bookmark',
    icon: Bookmark,
    route: '/bookmarks',
  },
  {
    label: 'Plants',
    icon: Sprout,
    route: '/plants',
  },
  {
    label: 'Well-being',
    icon: HeartPulse,
    route: '/modules/wellbeing',
  },
  {
    label: 'Games',
    icon: Gamepad2,
    route: '/modules/games',
  },
];

/* =========================================================
   FONTS
========================================================= */

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

/* =========================================================
   SCREEN
========================================================= */

export default function ModulesScreen() {
  const {
    accentForeground,
    isDark,
  } = useApp();

  const [menuOpen, setMenuOpen] =
    useState(false);

  const C = isDark
    ? {
        bg: '#090909',
        card: '#151515',
        border: '#2A2A2A',
        text: '#F4F2EE',
        muted: '#AAA59D',
      }
    : {
        bg: '#FBFAF8',
        card: '#FFFFFF',
        border: '#ECE9E4',
        text: '#27241F',
        muted: '#8F8A82',
      };

  return (
    <SafeAreaView
      style={[
        styles.safe,
        {
          backgroundColor: C.bg,
        },
      ]}
    >
      {/* =====================================================
          HEADER
      ===================================================== */}

      <View
        style={[
          styles.toolkitHeader,
          {
            borderBottomColor: C.border,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.headerBtn}
          hitSlop={12}
          accessibilityLabel="Go back"
        >
          <ChevronLeft
            color={C.text}
            size={24}
          />
        </Pressable>

        <Text
          style={[
            styles.toolkitTitle,
            {
              color: accentForeground,
            },
          ]}
        >
          MODULES
        </Text>

        <Pressable
          onPress={() => setMenuOpen(true)}
          style={styles.headerBtn}
          hitSlop={12}
          accessibilityLabel="More options"
        >
          <MoreVertical
            color={C.text}
            size={22}
          />
        </Pressable>
      </View>

      {/* =====================================================
          CONTENT
      ===================================================== */}

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: 22,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ===================================================
            YOUR LIFE SUMMARY
        =================================================== */}

        <Pressable
          onPress={() => {
            // Insights screen will be connected here.
          }}
          style={({ pressed }) => [
            styles.lifeSummaryCard,
            {
              backgroundColor: C.card,
              borderColor: C.border,
            },
            pressed && styles.lifeSummaryPressed,
          ]}
          accessibilityLabel="Open your life insights"
        >
          {/* TOP ROW */}

          <View style={styles.lifeSummaryHeader}>
            <Text
              style={[
                styles.lifeSummaryTitle,
                {
                  color: C.text,
                },
              ]}
            >
               DASHBOARD
            </Text>

            <View
              style={[
                styles.lifeSummaryArrow,
                {
                  backgroundColor: isDark
                    ? '#242424'
                    : '#F3F2EF',
                },
              ]}
            >
              <ChevronRight
                color={accentForeground}
                size={19}
                strokeWidth={2.5}
              />
            </View>
          </View>

          {/* =================================================
              OVERALL LIFE SCORE
          ================================================= */}

          <View style={styles.lifeSummaryMain}>
            <View>
              <View style={styles.scoreRow}>
                <Text
                  style={[
                    styles.lifeScore,
                    {
                      color: accentForeground,
                    },
                  ]}
                >
                  82%
                </Text>

                <Text
                  style={[
                    styles.lifeScoreTrend,
                    {
                      color: accentForeground,
                    },
                  ]}
                >
                  ↑ 7%
                </Text>
              </View>

              <Text
                style={[
                  styles.lifeScoreLabel,
                  {
                    color: C.muted,
                  },
                ]}
              >
                GOOD MOMENTUM
              </Text>
            </View>
          </View>

          {/* =================================================
              SIX CORE DIMENSIONS
              3 COLUMNS × 2 ROWS
          ================================================= */}

          <View
            style={[
              styles.dimensionGrid,
              {
                borderTopColor: C.border,
              },
            ]}
          >
            {/* -------------------------------------------------
                WELLBEING
            ------------------------------------------------- */}

            <View style={styles.dimension}>
              <View
                style={[
                  styles.dimensionIcon,
                  {
                    backgroundColor: isDark
                      ? '#242424'
                      : '#F3F2EF',
                  },
                ]}
              >
                <HeartPulse
                  color={accentForeground}
                  size={14}
                  strokeWidth={2.2}
                />
              </View>

              <View style={styles.dimensionText}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.dimensionLabel,
                    {
                      color: C.muted,
                    },
                  ]}
                >
                  WELLBEING
                </Text>

                <Text
                  style={[
                    styles.dimensionValue,
                    {
                      color: C.text,
                    },
                  ]}
                >
                  82
                </Text>
              </View>
            </View>

            {/* -------------------------------------------------
                EXECUTION
            ------------------------------------------------- */}

            <View style={styles.dimension}>
              <View
                style={[
                  styles.dimensionIcon,
                  {
                    backgroundColor: isDark
                      ? '#242424'
                      : '#F3F2EF',
                  },
                ]}
              >
                <CalendarDays
                  color={accentForeground}
                  size={14}
                  strokeWidth={2.2}
                />
              </View>

              <View style={styles.dimensionText}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.dimensionLabel,
                    {
                      color: C.muted,
                    },
                  ]}
                >
                  EXECUTION
                </Text>

                <Text
                  style={[
                    styles.dimensionValue,
                    {
                      color: C.text,
                    },
                  ]}
                >
                  76
                </Text>
              </View>
            </View>

            {/* -------------------------------------------------
                CONSISTENCY
            ------------------------------------------------- */}

            <View style={styles.dimension}>
              <View
                style={[
                  styles.dimensionIcon,
                  {
                    backgroundColor: isDark
                      ? '#242424'
                      : '#F3F2EF',
                  },
                ]}
              >
                <CheckCircle2
                  color={accentForeground}
                  size={14}
                  strokeWidth={2.2}
                />
              </View>

              <View style={styles.dimensionText}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.dimensionLabel,
                    {
                      color: C.muted,
                    },
                  ]}
                >
                  CONSISTENCY
                </Text>

                <Text
                  style={[
                    styles.dimensionValue,
                    {
                      color: C.text,
                    },
                  ]}
                >
                  84
                </Text>
              </View>
            </View>

            {/* -------------------------------------------------
                FINANCIAL
            ------------------------------------------------- */}

            <View style={styles.dimension}>
              <View
                style={[
                  styles.dimensionIcon,
                  {
                    backgroundColor: isDark
                      ? '#242424'
                      : '#F3F2EF',
                  },
                ]}
              >
                <WalletCards
                  color={accentForeground}
                  size={14}
                  strokeWidth={2.2}
                />
              </View>

              <View style={styles.dimensionText}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.dimensionLabel,
                    {
                      color: C.muted,
                    },
                  ]}
                >
                  FINANCIAL
                </Text>

                <Text
                  style={[
                    styles.dimensionValue,
                    {
                      color: C.text,
                    },
                  ]}
                >
                  71
                </Text>
              </View>
            </View>

            {/* -------------------------------------------------
                CONNECTION
            ------------------------------------------------- */}

            <View style={styles.dimension}>
              <View
                style={[
                  styles.dimensionIcon,
                  {
                    backgroundColor: isDark
                      ? '#242424'
                      : '#F3F2EF',
                  },
                ]}
              >
                <UsersRound
                  color={accentForeground}
                  size={14}
                  strokeWidth={2.2}
                />
              </View>

              <View style={styles.dimensionText}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.dimensionLabel,
                    {
                      color: C.muted,
                    },
                  ]}
                >
                  CONNECTION
                </Text>

                <Text
                  style={[
                    styles.dimensionValue,
                    {
                      color: C.text,
                    },
                  ]}
                >
                  63
                </Text>
              </View>
            </View>

            {/* -------------------------------------------------
                GROWTH
            ------------------------------------------------- */}

            <View style={styles.dimension}>
              <View
                style={[
                  styles.dimensionIcon,
                  {
                    backgroundColor: isDark
                      ? '#242424'
                      : '#F3F2EF',
                  },
                ]}
              >
                <Sprout
                  color={accentForeground}
                  size={14}
                  strokeWidth={2.2}
                />
              </View>

              <View style={styles.dimensionText}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.dimensionLabel,
                    {
                      color: C.muted,
                    },
                  ]}
                >
                  GROWTH
                </Text>

                <Text
                  style={[
                    styles.dimensionValue,
                    {
                      color: C.text,
                    },
                  ]}
                >
                  74
                </Text>
              </View>
            </View>
          </View>
        </Pressable>

        {/* ===================================================
            YOUR MODULES
        =================================================== */}

        <View style={styles.sectionLabelRow}>
          <Text
            style={[
              styles.sectionLabel,
              {
                color: C.muted,
              },
            ]}
          >
            YOUR MODULES
          </Text>
        </View>

        {/* ===================================================
            MODULE GRID
        =================================================== */}

        <View style={styles.grid}>
          {modules.map(
            ({
              label,
              icon: Icon,
              route,
            }) => (
              <Pressable
                key={label}
                onPress={() => {
                  if (route) {
                    router.push(
                      route as any,
                    );
                  }
                }}
                style={({ pressed }) => [
                  styles.module,
                  {
                    backgroundColor:
                      C.card,
                    borderColor:
                      C.border,
                  },
                  pressed &&
                    styles.modulePressed,
                ]}
              >
                <View
                  style={[
                    styles.moduleIcon,
                    {
                      backgroundColor:
                        accentForeground,
                    },
                  ]}
                >
                  <Icon
                    color="#FFFFFF"
                    size={26}
                    strokeWidth={2.1}
                  />
                </View>

                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                  style={[
                    styles.moduleLabel,
                    {
                      color: C.text,
                    },
                  ]}
                >
                  {label.toUpperCase()}
                </Text>
              </Pressable>
            ),
          )}
        </View>
      </ScrollView>

      {/* =====================================================
          RIGHT-HAND MENU
      ===================================================== */}

      {menuOpen && (
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setMenuOpen(false)}
        >
          <Pressable
            style={[
              styles.menu,
              {
                backgroundColor: C.card,
                borderColor: C.border,
              },
            ]}
            onPress={(event) =>
              event.stopPropagation()
            }
          >
            {/* SETTINGS */}

            <Pressable
              onPress={() => {
                setMenuOpen(false);
                router.push(
                  '/(tabs)/profile',
                );
              }}
              style={styles.menuItem}
            >
              <View
                style={[
                  styles.menuIcon,
                  {
                    backgroundColor:
                      isDark
                        ? '#292929'
                        : '#F3F2EF',
                  },
                ]}
              >
                <Settings
                  color={accentForeground}
                  size={17}
                />
              </View>

              <Text
                style={[
                  styles.menuItemText,
                  {
                    color: C.text,
                  },
                ]}
              >
                Settings
              </Text>
            </Pressable>

            {/* LOGOUT */}

            <Pressable
              onPress={() => {
                setMenuOpen(false);
              }}
              style={[
                styles.menuItem,
                styles.menuItemLast,
              ]}
            >
              <View
                style={[
                  styles.menuIcon,
                  {
                    backgroundColor:
                      isDark
                        ? '#292929'
                        : '#F3F2EF',
                  },
                ]}
              >
                <LogOut
                  color={C.muted}
                  size={17}
                />
              </View>

              <Text
                style={[
                  styles.menuItemText,
                  {
                    color: C.text,
                  },
                ]}
              >
                Logout
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

/* =========================================================
   STYLES
========================================================= */

const styles =
  StyleSheet.create({
    safe: {
      flex: 1,
    },

    /* =====================================================
       HEADER
    ===================================================== */

    toolkitHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      paddingHorizontal: 16,
      paddingTop: 24,
      paddingBottom: 8,
      borderBottomWidth: 1,
    },

    toolkitTitle: {
      fontFamily:
        FONT_BOLD,
      fontSize: 18,
      letterSpacing: 0.8,
    },

    headerBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    /* =====================================================
       CONTENT
    ===================================================== */

    content: {
      paddingHorizontal: 22,
      paddingBottom: 36,
    },

    /* =====================================================
       YOUR LIFE
    ===================================================== */

    lifeSummaryCard: {
      width: '100%',
      borderRadius: 22,
      borderWidth: 1,
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 16,
      marginBottom: 24,
    },

    lifeSummaryPressed: {
      opacity: 0.88,
    },

    lifeSummaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      marginBottom: 8,
    },

    lifeSummaryTitle: {
      fontFamily:
        FONT_BOLD,
      fontSize: 13,
      letterSpacing: 1,
    },

    lifeSummaryArrow: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    /* =====================================================
       OVERALL SCORE
    ===================================================== */

    lifeSummaryMain: {
      marginBottom: 11,
    },

    scoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },

    lifeScore: {
      fontFamily:
        FONT_BOLD,
      fontSize: 38,
      lineHeight: 43,
    },

    lifeScoreTrend: {
      fontFamily:
        FONT_BOLD,
      fontSize: 12,
      marginTop: 5,
    },

    lifeScoreLabel: {
      fontFamily:
        FONT_SEMI,
      fontSize: 9,
      letterSpacing: 1,
      marginTop: -1,
    },

    /* =====================================================
       SIX DIMENSIONS
    ===================================================== */

    dimensionGrid: {
      borderTopWidth: 1,
      paddingTop: 12,
      flexDirection: 'row',
      flexWrap: 'wrap',
      rowGap: 10,
    },

    dimension: {
      width: '33.333%',
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
      paddingRight: 4,
    },

    dimensionIcon: {
      width: 27,
      height: 27,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent:
        'center',
      marginRight: 5,
      flexShrink: 0,
    },

    dimensionText: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
    },

    dimensionLabel: {
      fontFamily:
        FONT_SEMI,
      fontSize: 6.5,
      letterSpacing: 0.25,
      includeFontPadding: false,
    },

    dimensionValue: {
      fontFamily:
        FONT_BOLD,
      fontSize: 14,
      lineHeight: 16,
      marginTop: 1,
    },

    /* =====================================================
       YOUR MODULES
    ===================================================== */

    sectionLabelRow: {
      marginBottom: 10,
    },

    sectionLabel: {
      fontFamily:
        FONT_BOLD,
      fontSize: 9,
      letterSpacing: 1,
    },

    /* =====================================================
       MODULE GRID
    ===================================================== */

    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent:
        'space-between',
    },

    module: {
      width: '31%',
      minHeight: 120,
      maxHeight: 150,
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 7,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent:
        'center',
      gap: 9,
    },

    modulePressed: {
      opacity: 0.7,
    },

    moduleIcon: {
      width: 48,
      height: 48,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    moduleLabel: {
      fontFamily:
        FONT_BOLD,
      fontSize: 8,
      letterSpacing: 0.15,
      textAlign: 'center',
      includeFontPadding: false,
      flexShrink: 1,
    },

    /* =====================================================
       MENU
    ===================================================== */

    menuOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor:
        'rgba(0,0,0,0.18)',
    },

    menu: {
      position: 'absolute',
      top: 72,
      right: 16,
      minWidth: 190,
      borderRadius: 16,
      borderWidth: 1,
      paddingVertical: 6,
      paddingHorizontal: 6,

      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 4,
      },
      shadowOpacity: 0.15,
      shadowRadius: 10,
      elevation: 8,
    },

    menuItem: {
      minHeight: 50,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 8,
      borderRadius: 11,
    },

    menuItemLast: {
      marginTop: 2,
    },

    menuIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    menuItemText: {
      fontFamily:
        FONT_SEMI,
      fontSize: 13,
      flex: 1,
    },
  });