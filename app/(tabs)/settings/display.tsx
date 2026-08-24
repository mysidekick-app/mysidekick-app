import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Moon, Check } from 'lucide-react-native';
import { PageHeader } from '@/components/PageHeader';
import { AccentFamily, accentPalettes, ThemeMode, useApp } from '@/components/AppProvider';

const accentChoices: { key: AccentFamily; label: string }[] = [{ key: 'red', label: 'Red' }, { key: 'orange', label: 'Orange' }, { key: 'mustard', label: 'Mustard' }, { key: 'green', label: 'Green' }, { key: 'blue', label: 'Blue' }, { key: 'indigo', label: 'Indigo' }, { key: 'violet', label: 'Violet' }];

export default function DisplaySettingsScreen() {
  const { accent, accentForeground, accent_family, theme_mode, updateSettings, isDark, onAccent } = useApp();
  return (
    <SafeAreaView style={[styles.safe, isDark && styles.safeDark]}>
      <PageHeader title="Display" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.panelTitle}><Moon color={accentForeground} size={16} /><Text style={[styles.panelTitleText, isDark && styles.darkText]}>Theme mode</Text></View>
          <View style={styles.modeToggle}>
            {(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => (
              <Pressable key={mode} onPress={() => updateSettings({ theme_mode: mode })} style={[styles.modeOption, theme_mode === mode && { backgroundColor: accentForeground }]}>
                <Text style={[styles.modeText, isDark && styles.darkMuted, theme_mode === mode && { color: onAccent }]}>{mode[0].toUpperCase() + mode.slice(1)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={[styles.card, isDark && styles.cardDark]}>
          <Text style={[styles.panelLabel, isDark && styles.darkText]}>Accent color</Text>
          <View style={styles.palette}>
            {accentChoices.map(({ key, label }) => (
              <Pressable key={key} onPress={() => updateSettings({ accent_family: key })} style={styles.swatchWrap}>
                <View style={[styles.swatch, { backgroundColor: accentPalettes[key].standard }, accent_family === key && { borderColor: isDark ? '#FFF' : '#26231F', borderWidth: 3 }]}>
                  {accent_family === key && <Check color="#FFF" size={14} strokeWidth={3} />}
                </View>
                <Text style={[styles.swatchLabel, isDark && styles.darkMuted]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#FBFAF8' }, safeDark: { backgroundColor: '#090909' }, content: { padding: 22, paddingBottom: 34 }, backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 16 }, backText: { fontFamily: 'Poppins-SemiBold', fontSize: 15, color: '#1D1C1A' }, darkText: { color: '#F4F2EE' }, darkMuted: { color: '#AAA59D' }, card: { backgroundColor: '#FFF', borderRadius: 17, borderWidth: 1, borderColor: '#ECE9E4', paddingHorizontal: 14, paddingVertical: 16, marginBottom: 19 }, cardDark: { backgroundColor: '#151515', borderColor: '#2A2A2A' }, panelTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }, panelTitleText: { fontFamily: 'Poppins-Bold', color: '#34312B', fontSize: 13 }, modeToggle: { flexDirection: 'row', backgroundColor: '#F4F2EE', borderRadius: 11, padding: 3 }, modeOption: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8 }, modeText: { fontFamily: 'Poppins-SemiBold', color: '#8D8981', fontSize: 12 }, modeTextActive: { color: '#FFF' }, panelLabel: { fontFamily: 'Poppins-Bold', color: '#34312B', fontSize: 13, marginBottom: 16 }, palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, swatchWrap: { alignItems: 'center', gap: 6, width: '20%' }, swatch: { width: 32, height: 32, borderRadius: 16, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' }, swatchLabel: { fontFamily: 'Poppins-Regular', fontSize: 9, color: '#88847D' } });
