import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  ChevronRight,
  CircleUserRound,
  Clock3,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Volume2,
} from 'lucide-react-native';

import { PageHeader } from '@/components/PageHeader';
import { useApp } from '@/components/AppProvider';
import { router } from 'expo-router';

const settingsRows = [
  {
    label: 'Account',
    icon: CircleUserRound,
    route: 'account',
  },
  {
    label: 'Display',
    icon: Volume2,
    route: 'display',
  },
  {
    label: 'Timezone',
    icon: Clock3,
    route: 'timezone',
  },
  {
    label: 'Password',
    icon: LockKeyhole,
    route: 'password',
  },
  {
    label: 'Privacy Policy',
    icon: ShieldCheck,
    route: 'privacy',
  },
  {
    label: 'Reset App',
    icon: RotateCcw,
    route: 'reset',
  },
];

export default function SettingsScreen() {
  const {
    accentForeground,
    isDark,
  } = useApp();

  return (
    <SafeAreaView
      style={[
        styles.safe,
        isDark && styles.safeDark,
      ]}
    >
      <PageHeader title="Settings" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.card,
            isDark && styles.cardDark,
          ]}
        >
          {settingsRows.map(
            (
              { label, icon: Icon, route: subRoute },
              index
            ) => (
              <Pressable
                key={label}
                onPress={() =>
                  router.push(
                    `/settings/${subRoute}` as any
                  )
                }
                style={[
                  styles.settingRow,
                  isDark &&
                    styles.settingRowDark,
                  index ===
                    settingsRows.length - 1 &&
                    styles.lastRow,
                ]}
              >
                <View
                  style={[
                    styles.rowIcon,
                    {
                      backgroundColor: isDark
                        ? '#292929'
                        : '#F3F2EF',
                    },
                  ]}
                >
                  <Icon
                    color={accentForeground}
                    size={17}
                  />
                </View>

                <Text
                  style={[
                    styles.rowLabel,
                    isDark && styles.darkText,
                  ]}
                >
                  {label}
                </Text>

                <ChevronRight
                  color={
                    isDark
                      ? '#77736C'
                      : '#B2AEA7'
                  }
                  size={17}
                />
              </Pressable>
            )
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FBFAF8',
  },

  safeDark: {
    backgroundColor: '#090909',
  },

  content: {
    padding: 22,
    paddingBottom: 34,
  },

  darkText: {
    color: '#F4F2EE',
  },

  card: {
    backgroundColor: '#FFF',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#ECE9E4',
    paddingHorizontal: 14,
  },

  cardDark: {
    backgroundColor: '#151515',
    borderColor: '#2A2A2A',
  },

  settingRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1EFEB',
    gap: 12,
  },

  settingRowDark: {
    borderBottomColor: '#292929',
  },

  lastRow: {
    borderBottomWidth: 0,
  },

  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rowLabel: {
    fontFamily: 'Poppins-SemiBold',
    color: '#34312B',
    fontSize: 13,
    flex: 1,
  },
});