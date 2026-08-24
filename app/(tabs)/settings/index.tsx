import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Bell, CircleUserRound, LockKeyhole, Volume2, Languages, ShieldCheck, RotateCcw } from 'lucide-react-native';
import { PageHeader } from '@/components/PageHeader';
import { useApp } from '@/components/AppProvider';
import { router } from 'expo-router';

const generalRows = [{ label: 'Account', icon: CircleUserRound, route: 'account' }, { label: 'Notifications', icon: Bell, route: 'notifications' }, { label: 'Display & Sound', icon: Volume2, route: 'display' }, { label: 'Language', icon: Languages, route: 'language' }];
const privacyRows = [{ label: 'Password', icon: LockKeyhole, route: 'password' }, { label: 'Privacy Policy', icon: ShieldCheck, route: 'privacy' }];
const advancedRows = [{ label: 'Reset App', icon: RotateCcw, route: 'reset' }];

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

export default function SettingsScreen() {
  const { accent, accentForeground, isDark } = useApp();
  return (
    <SafeAreaView style={[styles.safe, isDark && styles.safeDark]}>
      <PageHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.group, isDark && styles.darkMuted]}>GENERAL</Text>
        <View style={[styles.card, isDark && styles.cardDark]}>
          {generalRows.map(({ label, icon: Icon, route: subRoute }) => (
            <Pressable key={label} onPress={() => router.push(`/settings/${subRoute}`)} style={[styles.settingRow, isDark && styles.settingRowDark]}>
              <View style={[styles.rowIcon, { backgroundColor: isDark ? '#292929' : '#F3F2EF' }]}><Icon color={accentForeground} size={17} /></View>
              <Text style={[styles.rowLabel, isDark && styles.darkText]}>{label}</Text>
              <ChevronRight color={isDark ? '#77736C' : '#B2AEA7'} size={17} />
            </Pressable>
          ))}
        </View>
        <Text style={[styles.group, isDark && styles.darkMuted]}>SECURITY AND PRIVACY</Text>
        <View style={[styles.card, isDark && styles.cardDark]}>
          {privacyRows.map(({ label, icon: Icon, route: subRoute }) => (
            <Pressable key={label} onPress={() => router.push(`/settings/${subRoute}`)} style={[styles.settingRow, isDark && styles.settingRowDark]}>
              <View style={[styles.rowIcon, { backgroundColor: isDark ? '#292929' : '#F3F2EF' }]}><Icon color={accentForeground} size={17} /></View>
              <Text style={[styles.rowLabel, isDark && styles.darkText]}>{label}</Text>
              <ChevronRight color={isDark ? '#77736C' : '#B2AEA7'} size={17} />
            </Pressable>
          ))}
        </View>
        <Text style={[styles.group, isDark && styles.darkMuted]}>ADVANCED</Text>
        <View style={[styles.card, isDark && styles.cardDark]}>
          {advancedRows.map(({ label, icon: Icon, route: subRoute }) => (
            <Pressable key={label} onPress={() => router.push(`/settings/${subRoute}`)} style={[styles.settingRow, isDark && styles.settingRowDark]}>
              <View style={[styles.rowIcon, { backgroundColor: isDark ? '#292929' : '#F3F2EF' }]}><Icon color={accentForeground} size={17} /></View>
              <Text style={[styles.rowLabel, isDark && styles.darkText]}>{label}</Text>
              <ChevronRight color={isDark ? '#77736C' : '#B2AEA7'} size={17} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#FBFAF8' }, safeDark: { backgroundColor: '#090909' }, content: { padding: 22, paddingBottom: 34 }, darkText: { color: '#F4F2EE' }, darkMuted: { color: '#AAA59D' }, group: { fontFamily: 'Poppins-Bold', color: '#9A958C', fontSize: 10, letterSpacing: 1.5, marginBottom: 9, marginTop: 8 }, card: { backgroundColor: '#FFF', borderRadius: 17, borderWidth: 1, borderColor: '#ECE9E4', paddingHorizontal: 14, marginBottom: 19 }, cardDark: { backgroundColor: '#151515', borderColor: '#2A2A2A' }, settingRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F1EFEB', gap: 12 }, settingRowDark: { borderBottomColor: '#292929' }, rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, rowLabel: { fontFamily: 'Poppins-SemiBold', color: '#34312B', fontSize: 13, flex: 1 } });
