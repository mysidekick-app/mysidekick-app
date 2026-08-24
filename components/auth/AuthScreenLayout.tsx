import { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const FONT = 'Poppins-Regular';
const FONT_BOLD = 'Poppins-Bold';
const FONT_XB = 'Poppins-ExtraBold';

type AuthScreenLayoutProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
}>;

export function AuthScreenLayout({ title, subtitle, children }: AuthScreenLayoutProps) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FBFAF8' },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
  header: { paddingTop: 48, paddingBottom: 32 },
  title: { fontFamily: FONT_XB, fontSize: 32, lineHeight: 38, color: '#27241F', letterSpacing: -0.8 },
  subtitle: { fontFamily: FONT, fontSize: 14, lineHeight: 20, color: '#908B83', marginTop: 8 },
});

export const authStyles = StyleSheet.create({
  field: { marginBottom: 16 },
  label: { fontFamily: 'Poppins-Medium', fontSize: 13, color: '#5C5954', marginBottom: 8 },
  input: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E1DED8',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    fontFamily: FONT,
    fontSize: 15,
    color: '#282724',
  },
  primaryBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#2379E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryBtnText: { fontFamily: 'Poppins-SemiBold', fontSize: 16, color: '#FFFFFF' },
  linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24, gap: 6 },
  linkMuted: { fontFamily: FONT, fontSize: 14, color: '#908B83' },
  link: { fontFamily: 'Poppins-SemiBold', fontSize: 14, color: '#2379E8' },
  error: { fontFamily: FONT, fontSize: 13, color: '#E05252', marginBottom: 12, textAlign: 'center' },
  hint: { fontFamily: FONT, fontSize: 12, color: '#908B83', marginTop: 6 },
  disabled: { opacity: 0.6 },
});
