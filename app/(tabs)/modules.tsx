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
  ChevronLeft,
  MoreVertical,
  Sparkles,
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
          HOME
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
            paddingTop: 28,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
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

        {/* ===================================================
            SIDEKICK CARD
        =================================================== */}

        <View
          style={[
            styles.sidekickCard,
            {
              backgroundColor:
                accentForeground,
              borderColor:
                accentForeground,
            },
          ]}
        >
          {/* -------------------------------------------------
              CHARACTER STAGE
          ------------------------------------------------- */}

          <View
            style={
              styles.sidekickCharacterStage
            }
          >
            <View
              style={[
                styles.sidekickPeek,
                {
                  backgroundColor:
                    '#000000',
                },
              ]}
            >
              <Sparkles
                color="#FFFFFF"
                size={20}
                strokeWidth={2.2}
              />
            </View>
          </View>

          {/* -------------------------------------------------
              SIDEKICK MESSAGE
          ------------------------------------------------- */}

          <View
            style={styles.sidekickCopy}
          >
            <Text
              style={[
                styles.sidekickEyebrow,
                {
                  color:
                    '#FFFFFF',
                },
              ]}
            >
              YOUR SIDEKICK
            </Text>

            <Text
              style={[
                styles.sidekickTitle,
                {
                  color:
                    '#FFFFFF',
                },
              ]}
            >
              Tiny nudges.
              {'\n'}
              Bigger wins.
            </Text>

            <Text
              style={[
                styles.sidekickMessage,
                {
                  color:
                    'rgba(255,255,255,0.88)',
                },
              ]}
            >
              I’ll keep an eye on
              the little things and
              give you a friendly
              nudge when something
              deserves your attention.
            </Text>

            <Text
              style={[
                styles.sidekickHint,
                {
                  color:
                    'rgba(255,255,255,0.72)',
                },
              ]}
            >
              Your Sidekick is getting
              ready…
            </Text>
          </View>
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
            {/* Settings */}

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

            {/* Logout */}

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

    /* -----------------------------------------------------
       HEADER
    ----------------------------------------------------- */

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

    /* -----------------------------------------------------
       CONTENT
    ----------------------------------------------------- */

    content: {
      paddingHorizontal: 22,
      paddingBottom: 36,
    },

    /* -----------------------------------------------------
       MODULE GRID
    ----------------------------------------------------- */

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
      padding: 12,
      alignItems: 'center',
      justifyContent:
        'center',
      gap: 10,
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
      fontSize: 11,
      letterSpacing: 0.5,
      textAlign: 'center',
    },

    /* -----------------------------------------------------
       SIDEKICK
    ----------------------------------------------------- */

    sidekickCard: {
      width: '100%',
      minHeight: 190,
      marginTop: 22,
      borderRadius: 24,
      borderWidth: 1,
      paddingHorizontal: 18,
      paddingVertical: 18,
      overflow: 'hidden',
      flexDirection: 'row',
      alignItems: 'center',
    },

    sidekickCharacterStage: {
      width: 90,
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent:
        'flex-end',
      paddingBottom: 4,
      marginRight: 10,
    },

    /*
     * Temporary black-and-white
     * Sidekick placeholder.
     */

    sidekickPeek: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: 'center',
      justifyContent:
        'center',
      transform: [
        {
          translateY: 6,
        },
      ],
    },

    sidekickCopy: {
      flex: 1,
      paddingRight: 8,
    },

    sidekickEyebrow: {
      fontFamily:
        FONT_SEMI,
      fontSize: 9.5,
      letterSpacing: 1.2,
      marginBottom: 5,
    },

    sidekickTitle: {
      fontFamily:
        FONT_BOLD,
      fontSize: 18,
      lineHeight: 23,
      marginBottom: 7,
    },

    sidekickMessage: {
      fontFamily:
        FONT,
      fontSize: 12.5,
      lineHeight: 18,
    },

    sidekickHint: {
      fontFamily:
        FONT_MED,
      fontSize: 10.5,
      marginTop: 12,
      opacity: 0.75,
    },

    /* -----------------------------------------------------
       RIGHT-HAND MENU
    ----------------------------------------------------- */

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
      justifyContent: 'center',
    },

    menuItemText: {
      fontFamily:
        FONT_SEMI,
      fontSize: 13,
      flex: 1,
    },
  });