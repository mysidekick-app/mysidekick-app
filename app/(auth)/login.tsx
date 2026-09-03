import { useState } from 'react';

import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Eye, EyeOff, Sparkles } from 'lucide-react-native';
import { Link, router } from 'expo-router';

import { useAuth } from '@/components/AuthProvider';

const COLORS = {
  background: '#000000',
  card: '#151515',
  input: '#0B0B0B',
  charcoal: '#252525',
  charcoalLight: '#333333',
  border: '#303030',
  text: '#FFFFFF',
  muted: '#A7A7A7',
  placeholder: '#777777',
  error: '#FF7777',
};

export default function LoginScreen() {
  const { signIn, loading: authLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleEmailLogin = async () => {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = await signIn(email.trim(), password);

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.replace('/modules' as never);
  };

  if (authLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingScreen}>
          <View style={styles.logoMark}>
            <Sparkles size={18} color={COLORS.text} strokeWidth={2.2} />
          </View>

          <Text style={styles.logoText}>sidekick</Text>

          <ActivityIndicator
            size="small"
            color={COLORS.text}
            style={styles.loadingIndicator}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            {/* Logo placeholder */}
            <View style={styles.brand}>
              <View style={styles.logoMark}>
                <Sparkles size={18} color={COLORS.text} strokeWidth={2.2} />
              </View>

              <Text style={styles.logoText}>sidekick</Text>
              <Text style={styles.logoCaption}>your everyday companion</Text>
            </View>

            <View style={styles.heading}>
              <Text style={styles.title}>Welcome back</Text>
              <Text style={styles.subtitle}>Sign in to continue</Text>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>

                <TextInput
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    if (error) setError(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  placeholder="you@example.com"
                  placeholderTextColor={COLORS.placeholder}
                  style={styles.input}
                  selectionColor={COLORS.text}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Password</Text>

                <View style={styles.passwordInputWrap}>
                  <TextInput
                    value={password}
                    onChangeText={(value) => {
                      setPassword(value);
                      if (error) setError(null);
                    }}
                    secureTextEntry={!showPassword}
                    autoComplete="password"
                    placeholder="Your password"
                    placeholderTextColor={COLORS.placeholder}
                    style={[styles.input, styles.passwordInput]}
                    selectionColor={COLORS.text}
                  />

                  <Pressable
                    onPress={() => setShowPassword((current) => !current)}
                    style={styles.eyeButton}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    {showPassword ? (
                      <EyeOff
                        size={19}
                        color={COLORS.muted}
                        strokeWidth={2.2}
                      />
                    ) : (
                      <Eye
                        size={19}
                        color={COLORS.muted}
                        strokeWidth={2.2}
                      />
                    )}
                  </Pressable>
                </View>
              </View>

              <Pressable
                onPress={handleEmailLogin}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && !submitting && styles.buttonPressed,
                  submitting && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {submitting ? 'Signing in...' : 'Sign In'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.linkRow}>
              <Text style={styles.linkMuted}>New here?</Text>

              <Link href="/signup" asChild>
                <Pressable hitSlop={8}>
                  <Text style={styles.link}>Create an account</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  keyboard: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 28,
  },

  card: {
    width: '100%',
    maxWidth: 430,
    backgroundColor: COLORS.card,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#242424',
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 26,
  },

  brand: {
    alignItems: 'center',
    marginBottom: 30,
  },

  logoMark: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: COLORS.charcoal,
    borderWidth: 1,
    borderColor: '#3A3A3A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9,
  },

  logoText: {
    color: COLORS.text,
    fontFamily: 'Poppins-Bold',
    fontSize: 23,
    letterSpacing: -0.5,
  },

  logoCaption: {
    color: COLORS.muted,
    fontFamily: 'Poppins-Regular',
    fontSize: 10.5,
    marginTop: 2,
    letterSpacing: 0.4,
  },

  heading: {
    alignItems: 'center',
    marginBottom: 25,
  },

  title: {
    color: COLORS.text,
    fontFamily: 'Poppins-Bold',
    fontSize: 22,
    letterSpacing: -0.3,
  },

  subtitle: {
    color: COLORS.muted,
    fontFamily: 'Poppins-Regular',
    fontSize: 12.5,
    marginTop: 4,
  },

  errorBox: {
    backgroundColor: '#241414',
    borderWidth: 1,
    borderColor: '#492323',
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginBottom: 15,
  },

  error: {
    color: COLORS.error,
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },

  form: {
    width: '100%',
  },

  field: {
    marginBottom: 16,
  },

  label: {
    color: COLORS.text,
    fontFamily: 'Poppins-Medium',
    fontSize: 11.5,
    marginBottom: 7,
    marginLeft: 3,
  },

  input: {
    width: '100%',
    minHeight: 52,
    backgroundColor: COLORS.input,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    paddingHorizontal: 15,
    color: COLORS.text,
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
  },

  passwordInputWrap: {
    position: 'relative',
    width: '100%',
  },

  passwordInput: {
    paddingRight: 50,
  },

  eyeButton: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryButton: {
    minHeight: 52,
    borderRadius: 15,
    backgroundColor: COLORS.charcoal,
    borderWidth: 1,
    borderColor: COLORS.charcoalLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
  },

  primaryButtonText: {
    color: COLORS.text,
    fontFamily: 'Poppins-Bold',
    fontSize: 12.5,
    letterSpacing: 0.6,
  },

  buttonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },

  buttonDisabled: {
    opacity: 0.55,
  },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 22,
  },

  linkMuted: {
    color: COLORS.muted,
    fontFamily: 'Poppins-Regular',
    fontSize: 11.5,
  },

  link: {
    color: COLORS.text,
    fontFamily: 'Poppins-SemiBold',
    fontSize: 11.5,
  },

  loadingScreen: {   
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingIndicator: {
    marginTop: 24,
  },
});
