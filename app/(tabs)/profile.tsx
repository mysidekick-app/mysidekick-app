import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, Camera, Check, ChevronLeft, ChevronRight, CircleUserRound, Languages, LockKeyhole, LogOut, Moon, Pencil, RotateCcw, ShieldCheck, Volume2, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { useApp, AccentFamily, accentPalettes, ThemeMode } from '@/components/AppProvider';
import { CurrencyPickerModal } from '@/components/CurrencyPickerModal';
import { getCurrency } from '@/components/currencies';

const MAX_BIO_WORDS = 30;
const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';
const FONT_XB = 'Poppins-ExtraBold';

const LANGUAGES = ['English', 'Spanish', 'Arabic', 'French', 'Portuguese', 'German'];

const accentChoices: { key: AccentFamily; label: string }[] = [
  { key: 'red', label: 'Red' }, { key: 'orange', label: 'Orange' }, { key: 'mustard', label: 'Mustard' },
  { key: 'green', label: 'Green' }, { key: 'blue', label: 'Blue' }, { key: 'indigo', label: 'Indigo' }, { key: 'violet', label: 'Violet' },
];

type SettingKey = 'account' | 'display' | 'language' | 'password' | 'privacy' | 'reset' | null;

export default function ProfileScreen() {
  const { display_name, title, bio, accent, accentForeground, accentWash, updateSettings, isDark, onAccent, currency_code, theme_mode, accent_family } = useApp();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(display_name);
  const [profileTitle, setProfileTitle] = useState(title);
  const [profileBio, setProfileBio] = useState(bio);
  const [openSetting, setOpenSetting] = useState<SettingKey>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [selectedLang, setSelectedLang] = useState('English');

  const currency = getCurrency(currency_code);

  const clampBio = (text: string) => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length <= MAX_BIO_WORDS) return text;
    return words.slice(0, MAX_BIO_WORDS).join(' ');
  };
  const bioWordCount = profileBio.trim().split(/\s+/).filter(Boolean).length;

  const save = async () => {
    await updateSettings({ display_name: name.trim() || 'User', title: profileTitle, bio: clampBio(profileBio) });
    setEditing(false);
  };

  const C = isDark
    ? { bg: '#090909', card: '#151515', border: '#2A2A2A', text: '#F4F2EE', muted: '#AAA59D', input: '#1E1E1E', inputBorder: '#363636', divider: '#292929' }
    : { bg: '#FBFAF8', card: '#FFFFFF', border: '#ECE9E4', text: '#27241F', muted: '#8F8A82', input: '#FCFBF9', inputBorder: '#E0DDD7', divider: '#F1EFEB' };

  const settingRows: { key: SettingKey; label: string; icon: typeof Bell }[] = [
    { key: 'account', label: 'Account', icon: CircleUserRound },
    { key: 'display', label: 'Display', icon: Volume2 },
    { key: 'language', label: 'Language', icon: Languages },
    { key: 'password', label: 'Password', icon: LockKeyhole },
    { key: 'privacy', label: 'Privacy Policy', icon: ShieldCheck },
    { key: 'reset', label: 'Reset App', icon: RotateCcw },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: C.bg }]}>
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <View style={[styles.profileCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={styles.avatarRow}>
            <View style={[styles.avatar, { backgroundColor: accentWash, borderColor: accent.light }]}>
              <Text style={[styles.avatarText, { color: accentForeground }]}>{(display_name || 'U').slice(0, 1).toUpperCase()}</Text>
              <Pressable style={[styles.camera, { backgroundColor: accentForeground }]}><Camera color="#FFF" size={14} /></Pressable>
            </View>
            {editing ? (
              <View style={styles.formInline}>
                <Text style={[styles.fieldLabel, { color: C.muted }]}>Name</Text>
                <TextInput value={name} onChangeText={setName} style={[styles.input, { backgroundColor: C.input, borderColor: C.inputBorder, color: C.text }]} placeholder="Your name" placeholderTextColor={C.muted} autoFocus />
                <Text style={[styles.fieldLabel, { color: C.muted }]}>Title / Tags</Text>
                <TextInput value={profileTitle} onChangeText={setProfileTitle} style={[styles.input, { backgroundColor: C.input, borderColor: C.inputBorder, color: C.text }]} placeholder="How would you describe yourself?" placeholderTextColor={C.muted} />
              </View>
            ) : (
              <View style={styles.profileCopy}>
                <Text style={[styles.name, { color: C.text }]}>{display_name}</Text>
                <Text style={[styles.profileTitleText, { color: accentForeground }]}>{title}</Text>
              </View>
            )}
          </View>
          {editing ? (
            <View style={styles.bioForm}>
              <View style={styles.bioLabelRow}>
                <Text style={[styles.fieldLabel, { color: C.muted }]}>Bio</Text>
                <Text style={[styles.wordCount, { color: C.muted }]}>{bioWordCount}/{MAX_BIO_WORDS}</Text>
              </View>
              <TextInput value={profileBio} onChangeText={(t) => setProfileBio(clampBio(t))} style={[styles.input, styles.bio, { backgroundColor: C.input, borderColor: C.inputBorder, color: C.text }]} multiline placeholder="A little about you" placeholderTextColor={C.muted} />
            </View>
          ) : (
            <Text style={[styles.bioText, { color: C.muted }]}>{bio}</Text>
          )}
          <Pressable onPress={editing ? save : () => { setName(display_name); setProfileTitle(title); setProfileBio(bio); setEditing(true); }} style={[styles.primaryButton, { backgroundColor: accentForeground }]}>
            {editing ? <Check color="#FFF" size={17} /> : <Pencil color="#FFF" size={16} />}
            <Text style={[styles.primaryText, { color: onAccent }]}>{editing ? 'Save changes' : 'Edit Profile'}</Text>
          </Pressable>
          <View style={styles.logoutWrap}>
            <Pressable style={styles.logout}><LogOut color={C.muted} size={16} /><Text style={[styles.logoutText, { color: C.muted }]}>Logout</Text></Pressable>
          </View>
        </View>

        {/* Settings section */}
        <Text style={[styles.settingsTitle, { color: C.muted }]}>SETTINGS</Text>
        <View style={[styles.settingsCard, { backgroundColor: C.card, borderColor: C.border }]}>
          {settingRows.map(({ key, label, icon: Icon }, i) => (
            <Pressable
              key={key}
              onPress={() => setOpenSetting(key)}
              style={[styles.settingRow, { borderBottomColor: C.divider }, i === settingRows.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={[styles.rowIcon, { backgroundColor: isDark ? '#292929' : '#F3F2EF' }]}>
                <Icon color={accentForeground} size={17} />
              </View>
              <Text style={[styles.rowLabel, { color: C.text }]}>{label}</Text>
              <ChevronRight color={isDark ? '#77736C' : '#B2AEA7'} size={17} />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Account sheet */}
      <Modal visible={openSetting === 'account'} transparent animationType="slide" onRequestClose={() => setOpenSetting(null)}>
        <View style={styles.modalShade}>
          <View style={[styles.sheet, { backgroundColor: C.card }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: C.text }]}>Account</Text>
              <Pressable onPress={() => setOpenSetting(null)} hitSlop={12}><X color={C.muted} size={21} /></Pressable>
            </View>
            <Text style={[styles.group, { color: C.muted }]}>PREFERENCES</Text>
            <Pressable onPress={() => { setCurrencyOpen(true); }} style={styles.settingRow}>
              <View style={[styles.rowIcon, { backgroundColor: accentForeground }]}>
                <Text style={[styles.currencySymbol, { color: onAccent }]}>{currency.symbol}</Text>
              </View>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowLabel, { color: C.text }]}>Currency</Text>
                <Text style={[styles.rowValue, { color: C.muted }]}>{currency.name} ({currency.code})</Text>
              </View>
              <ChevronRight color={isDark ? '#77736C' : '#B2AEA7'} size={17} />
            </Pressable>
            <Pressable onPress={() => { setOpenSetting(null); }} style={[styles.saveButton, { backgroundColor: accentForeground }]}>
              <Text style={[styles.saveText, { color: onAccent }]}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Display sheet */}
      <Modal visible={openSetting === 'display'} transparent animationType="slide" onRequestClose={() => setOpenSetting(null)}>
        <View style={styles.modalShade}>
          <View style={[styles.sheet, { backgroundColor: C.card }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: C.text }]}>Display</Text>
              <Pressable onPress={() => setOpenSetting(null)} hitSlop={12}><X color={C.muted} size={21} /></Pressable>
            </View>
            <View style={[styles.subCard, { borderColor: C.border }]}>
              <View style={styles.panelTitleRow}><Moon color={accentForeground} size={16} /><Text style={[styles.panelTitleText, { color: C.text }]}>Theme mode</Text></View>
              <View style={[styles.modeToggle, { backgroundColor: isDark ? '#1A1A1A' : '#F4F2EE' }]}>
                {(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => (
                  <Pressable key={mode} onPress={() => updateSettings({ theme_mode: mode })} style={[styles.modeOption, theme_mode === mode && { backgroundColor: accentForeground }]}>
                    <Text style={[styles.modeText, { color: C.muted }, theme_mode === mode && { color: onAccent }]}>{mode[0].toUpperCase() + mode.slice(1)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={[styles.subCard, { borderColor: C.border }]}>
              <Text style={[styles.panelLabel, { color: C.text }]}>Accent color</Text>
              <View style={styles.palette}>
                {accentChoices.map(({ key, label }) => (
                  <Pressable key={key} onPress={() => updateSettings({ accent_family: key })} style={styles.swatchWrap}>
                    <View style={[styles.swatch, { backgroundColor: accentPalettes[key].standard }, accent_family === key && { borderColor: isDark ? '#FFF' : '#26231F', borderWidth: 3 }]}>
                      {accent_family === key && <Check color="#FFF" size={14} strokeWidth={3} />}
                    </View>
                    <Text style={[styles.swatchLabel, { color: C.muted }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Pressable onPress={() => setOpenSetting(null)} style={[styles.saveButton, { backgroundColor: accentForeground }]}>
              <Text style={[styles.saveText, { color: onAccent }]}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Language sheet */}
      <Modal visible={openSetting === 'language'} transparent animationType="slide" onRequestClose={() => setOpenSetting(null)}>
        <View style={styles.modalShade}>
          <View style={[styles.sheet, { backgroundColor: C.card }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: C.text }]}>Language</Text>
              <Pressable onPress={() => setOpenSetting(null)} hitSlop={12}><X color={C.muted} size={21} /></Pressable>
            </View>
            <ScrollView style={styles.langScroll} showsVerticalScrollIndicator={false}>
              {LANGUAGES.map((lang) => (
                <Pressable key={lang} onPress={() => setSelectedLang(lang)} style={[styles.langRow, { borderBottomColor: C.divider }]}>
                  <Text style={[styles.langText, { color: C.text }]}>{lang}</Text>
                  {selectedLang === lang && <Check color={accentForeground} size={18} />}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={() => setOpenSetting(null)} style={[styles.saveButton, { backgroundColor: accentForeground }]}>
              <Text style={[styles.saveText, { color: onAccent }]}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Password sheet */}
      <Modal visible={openSetting === 'password'} transparent animationType="slide" onRequestClose={() => setOpenSetting(null)}>
        <View style={styles.modalShade}>
          <View style={[styles.sheet, { backgroundColor: C.card }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: C.text }]}>Password</Text>
              <Pressable onPress={() => setOpenSetting(null)} hitSlop={12}><X color={C.muted} size={21} /></Pressable>
            </View>
            <Text style={[styles.placeholder, { color: C.muted }]}>Password management will be available soon.</Text>
            <Pressable onPress={() => setOpenSetting(null)} style={[styles.saveButton, { backgroundColor: accentForeground }]}>
              <Text style={[styles.saveText, { color: onAccent }]}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Privacy sheet */}
      <Modal visible={openSetting === 'privacy'} transparent animationType="slide" onRequestClose={() => setOpenSetting(null)}>
        <View style={styles.modalShade}>
          <View style={[styles.sheet, { backgroundColor: C.card }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: C.text }]}>Privacy Policy</Text>
              <Pressable onPress={() => setOpenSetting(null)} hitSlop={12}><X color={C.muted} size={21} /></Pressable>
            </View>
            <Text style={[styles.placeholder, { color: C.muted }]}>Privacy policy details will be available soon.</Text>
            <Pressable onPress={() => setOpenSetting(null)} style={[styles.saveButton, { backgroundColor: accentForeground }]}>
              <Text style={[styles.saveText, { color: onAccent }]}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Reset sheet */}
      <Modal visible={openSetting === 'reset'} transparent animationType="slide" onRequestClose={() => setOpenSetting(null)}>
        <View style={styles.modalShade}>
          <View style={[styles.sheet, { backgroundColor: C.card }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: C.text }]}>Reset App</Text>
              <Pressable onPress={() => setOpenSetting(null)} hitSlop={12}><X color={C.muted} size={21} /></Pressable>
            </View>
            <Text style={[styles.placeholder, { color: C.muted }]}>This will reset all app data to defaults. This action cannot be undone.</Text>
            <Pressable onPress={() => setOpenSetting(null)} style={[styles.saveButton, { backgroundColor: '#C53A2F' }]}>
              <Text style={[styles.saveText, { color: '#FFF' }]}>Reset</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <CurrencyPickerModal
        visible={currencyOpen}
        currentCode={currency_code}
        onSelect={(code) => updateSettings({ currency_code: code })}
        onClose={() => setCurrencyOpen(false)}
        accent={accentForeground}
        onAccent={onAccent}
        isDark={isDark}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingTop: 28, paddingVertical: 12, borderBottomWidth: 1 },
  headerSpacer: { width: 1, height: 1 },
  headerTitle: { fontFamily: FONT_XB, fontSize: 16, letterSpacing: 1.4 },
  content: { padding: 22, paddingBottom: 40 },
  profileCard: { borderRadius: 20, borderWidth: 1, padding: 22 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 22 },
  avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  avatarText: { fontFamily: FONT_BOLD, fontSize: 28 },
  camera: { position: 'absolute', bottom: -2, right: -3, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' },
  profileCopy: { flex: 1 },
  name: { fontFamily: FONT_BOLD, fontSize: 22 },
  profileTitleText: { fontFamily: FONT_SEMI, fontSize: 12, marginTop: 5 },
  formInline: { flex: 1, gap: 4 },
  bioForm: { marginBottom: 22 },
  bioLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldLabel: { fontFamily: FONT_MED, fontSize: 11, marginBottom: 7, marginTop: 10 },
  wordCount: { fontFamily: FONT, fontSize: 10, marginTop: 10 },
  input: { width: '100%', minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 13, fontSize: 13, fontFamily: FONT },
  bio: { height: 84, paddingTop: 12, textAlignVertical: 'top' },
  bioText: { fontFamily: FONT, fontSize: 13, lineHeight: 20, marginBottom: 24 },
  primaryButton: { height: 45, borderRadius: 13, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%' },
  primaryText: { fontFamily: FONT_BOLD, fontSize: 13 },
  logoutWrap: { alignItems: 'center', marginTop: 18 },
  logout: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 8 },
  logoutText: { fontFamily: FONT_SEMI, fontSize: 12 },
  settingsTitle: { fontFamily: FONT_BOLD, fontSize: 10, letterSpacing: 1.5, marginBottom: 9, marginTop: 28, marginLeft: 4 },
  settingsCard: { borderRadius: 17, borderWidth: 1, paddingHorizontal: 14 },
  settingRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, gap: 12 },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontFamily: FONT_SEMI, fontSize: 14, flex: 1 },
  rowValue: { fontFamily: FONT, fontSize: 12 },
  rowCopy: { flex: 1, gap: 2 },
  currencySymbol: { fontFamily: FONT_BOLD, fontSize: 14 },
  modalShade: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34, maxHeight: '85%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sheetTitle: { fontFamily: FONT_BOLD, fontSize: 18, flex: 1, marginRight: 12 },
  group: { fontFamily: FONT_BOLD, fontSize: 10, letterSpacing: 1.5, marginBottom: 9, marginTop: 8 },
  subCard: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 16 },
  panelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  panelTitleText: { fontFamily: FONT_BOLD, fontSize: 13 },
  panelLabel: { fontFamily: FONT_BOLD, fontSize: 13, marginBottom: 16 },
  modeToggle: { flexDirection: 'row', borderRadius: 11, padding: 3 },
  modeOption: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  modeText: { fontFamily: FONT_SEMI, fontSize: 12 },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  swatchWrap: { alignItems: 'center', gap: 6, width: '20%' },
  swatch: { width: 32, height: 32, borderRadius: 16, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  swatchLabel: { fontFamily: FONT, fontSize: 9 },
  langScroll: { maxHeight: 300 },
  langRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1 },
  langText: { fontFamily: FONT_MED, fontSize: 15 },
  placeholder: { fontFamily: FONT, fontSize: 14, lineHeight: 22, paddingVertical: 20 },
  saveButton: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 22 },
  saveText: { fontFamily: FONT_SEMI, fontSize: 15 },
});
