import { useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Image,
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

import { Check, Eye, EyeOff, X } from 'lucide-react-native';
import { Link, router } from 'expo-router';

import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';

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
  success: '#70D39A',
  error: '#FF7777',
  errorBg: '#241414',
  errorBorder: '#492323',
};

const MIN_USERNAME_LENGTH = 5;
const MAX_USERNAME_LENGTH = 20;
const MIN_PASSWORD_LENGTH = 6;

export default function SignUpScreen() {
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(
    null
  );
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const isValidUsername = (value: string) => {
    if (!value) return false;

    if (
      value.length < MIN_USERNAME_LENGTH ||
      value.length > MAX_USERNAME_LENGTH
    ) {
      return false;
    }

    if (!/^[a-z0-9]/.test(value)) return false;
    if (!/[a-z0-9]$/.test(value)) return false;

    if (!/^[a-z0-9_.]+$/.test(value)) return false;

    for (let i = 0; i < value.length; i++) {
      if (value[i] === '.') {
        const before = value[i - 1];
        const after = value[i + 1];

        if (
          !before ||
          !after ||
          !/[a-z]/.test(before) ||
          !/[a-z]/.test(after)
        ) {
          return false;
        }
      }
    }

    return true;
  };

  useEffect(() => {
    const cleanUsername = username.trim().toLowerCase();

    setUsernameAvailable(null);
    setUsernameError(null);

    if (!cleanUsername) {
      return;
    }

    if (cleanUsername.length < MIN_USERNAME_LENGTH) {
      setUsernameError(
        `Username must be at least ${MIN_USERNAME_LENGTH} characters.`
      );
      return;
    }

    if (cleanUsername.length > MAX_USERNAME_LENGTH) {
      setUsernameError(
        `Username must be ${MAX_USERNAME_LENGTH} characters or fewer.`
      );
      return;
    }

    if (!isValidUsername(cleanUsername)) {
      setUsernameError('Username format is not valid.');
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      setUsernameChecking(true);

      const { data, error: queryError } = await supabase.rpc(
        'is_username_available',
        {
          check_username: cleanUsername,
        }
      );

      if (cancelled) return;

      setUsernameChecking(false);

      if (queryError) {
        console.error(
          'Username availability check failed:',
          queryError.message
        );

        setUsernameAvailable(null);
        setUsernameError(
          'Could not check username availability. Please try again.'
        );

        return;
      }

      if (data === false) {
        setUsernameAvailable(false);
        setUsernameError('Username not available.');
      } else {
        setUsernameAvailable(true);
        setUsernameError(null);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username]);

  const handleUsernameChange = (value: string) => {
    const lower = value.toLowerCase().slice(0, MAX_USERNAME_LENGTH);

    setUsername(lower);

    if (error) {
      setError(null);
    }
  };

  // Password requirements
  const passwordHasLetter = /[A-Za-z]/.test(password);
  const passwordHasNumber = /[0-9]/.test(password);
  const passwordHasSpecialCharacter = /[^A-Za-z0-9]/.test(password);

  const passwordLengthValid =
    password.length >= MIN_PASSWORD_LENGTH;

  const passwordValid =
    passwordLengthValid &&
    passwordHasLetter &&
    passwordHasNumber &&
    passwordHasSpecialCharacter;

  const handlePasswordChange = (value: string) => {
    setPassword(value);

    if (error) {
      setError(null);
    }
  };

  const handleSignUp = async () => {
    setError(null);

    const cleanFullName = fullName.trim();
    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanFullName) {
      setError('Please enter your full name.');
      return;
    }

    if (!cleanUsername) {
      setError('Please choose a username.');
      return;
    }

    if (cleanUsername.length < MIN_USERNAME_LENGTH) {
      setError(
        `Username must be at least ${MIN_USERNAME_LENGTH} characters.`
      );
      return;
    }

    if (cleanUsername.length > MAX_USERNAME_LENGTH) {
      setError(
        `Username must be ${MAX_USERNAME_LENGTH} characters or fewer.`
      );
      return;
    }

    if (!isValidUsername(cleanUsername)) {
      setError('Please enter a valid username.');
      return;
    }

    if (usernameChecking) {
      setError('Please wait while we check your username.');
      return;
    }

    if (usernameAvailable !== true) {
      setError('Please choose an available username.');
      return;
    }

    if (!cleanEmail) {
      setError('Please enter your email.');
      return;
    }

    // Final password validation before creating the account.
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
      );
      return;
    }

    if (!passwordHasLetter) {
      setError('Password must contain at least 1 letter.');
      return;
    }

    if (!passwordHasNumber) {
      setError('Password must contain at least 1 number.');
      return;
    }

    if (!passwordHasSpecialCharacter) {
      setError(
        'Password must contain at least 1 special character.'
      );
      return;
    }

    if (!passwordValid) {
      setError('Please meet all password requirements.');
      return;
    }

    setSubmitting(true);

    const result = await signUp(cleanEmail, password, {
      full_name: cleanFullName,
      username: cleanUsername,
    });

    setSubmitting(false);

    if (result.error) {
      const message = result.error.toLowerCase();

      if (
        message.includes('username') &&
        (message.includes('duplicate') ||
          message.includes('unique') ||
          message.includes('already'))
      ) {
        setUsernameAvailable(false);
        setUsernameError('Username not available.');
        setError('Username not available. Please choose another.');
      } else {
        setError(result.error);
      }

      return;
    }

    router.replace('/modules' as never);
  };

  const usernameLength = username.length;

  const usernameLengthValid =
    usernameLength >= MIN_USERNAME_LENGTH &&
    usernameLength <= MAX_USERNAME_LENGTH;

  const usernameValid =
    usernameLengthValid && isValidUsername(username);

  const showUsernameStatus =
    usernameLength > 0 && usernameValid;

  const canSubmit =
    !submitting &&
    !usernameChecking &&
    usernameAvailable === true &&
    usernameValid &&
    passwordValid &&
    !!fullName.trim() &&
    !!email.trim();

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
            <View style={styles.brand}>
              <Image
                source={require('@/assets/sidekick.png')}
                style={styles.logoImage}
                resizeMode="cover"
              />
            </View>

            <View style={styles.heading}>
              <Text style={styles.title}>Create your account</Text>

              <Text style={styles.subtitle}>
                A little sidekick for everyday life
              </Text>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.form}>
              {/* FULL NAME */}

              <View style={styles.field}>
                <Text style={styles.label}>Full Name</Text>

                <TextInput
                  value={fullName}
                  onChangeText={(value) => {
                    setFullName(value);

                    if (error) {
                      setError(null);
                    }
                  }}
                  placeholder="John Doe"
                  placeholderTextColor={COLORS.placeholder}
                  style={styles.input}
                  autoCapitalize="words"
                  autoCorrect={false}
                  selectionColor={COLORS.text}
                />
              </View>

              {/* USERNAME */}

              <View style={styles.field}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Username</Text>

                  <Text
                    style={[
                      styles.counter,
                      usernameLength >= MIN_USERNAME_LENGTH &&
                        usernameLength <= MAX_USERNAME_LENGTH &&
                        styles.counterValid,
                    ]}
                  >
                    {usernameLength}/{MAX_USERNAME_LENGTH}
                  </Text>
                </View>

                <View style={styles.usernameInputWrap}>
                  <TextInput
                    value={username}
                    onChangeText={handleUsernameChange}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username"
                    maxLength={MAX_USERNAME_LENGTH}
                    placeholder="johndoe"
                    placeholderTextColor={COLORS.placeholder}
                    style={[
                      styles.input,
                      styles.usernameInput,
                      usernameAvailable === true &&
                        styles.inputSuccess,
                      usernameAvailable === false &&
                        styles.inputError,
                    ]}
                    selectionColor={COLORS.text}
                  />

                  {showUsernameStatus ? (
                    <View style={styles.statusIcon}>
                      {usernameChecking ? (
                        <ActivityIndicator
                          size="small"
                          color={COLORS.muted}
                        />
                      ) : usernameAvailable === true ? (
                        <Check
                          size={19}
                          color={COLORS.success}
                          strokeWidth={3}
                        />
                      ) : usernameAvailable === false ? (
                        <X
                          size={19}
                          color={COLORS.error}
                          strokeWidth={3}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>

                {usernameError ? (
                  <Text
                    style={[
                      styles.usernameHint,
                      styles.usernameError,
                    ]}
                  >
                    {usernameError}
                  </Text>
                ) : usernameAvailable === true ? (
                  <Text
                    style={[
                      styles.usernameHint,
                      styles.usernameSuccess,
                    ]}
                  >
                    Username available
                  </Text>
                ) : (
                  <Text
                    style={[
                      styles.usernameHint,
                      usernameLength > 0 &&
                        usernameLength < MIN_USERNAME_LENGTH &&
                        styles.usernameRequirement,
                    ]}
                  >
                    5–20 characters. Lowercase letters, numbers,
                    underscores and dots between letters.
                  </Text>
                )}
              </View>

              {/* EMAIL */}

              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>

                <TextInput
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);

                    if (error) {
                      setError(null);
                    }
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

              {/* PASSWORD */}

              <View style={styles.field}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Password</Text>

                  <Text
                    style={[
                      styles.counter,
                      passwordValid && styles.counterValid,
                    ]}
                  >
                    {password.length}
                  </Text>
                </View>

                <View style={styles.passwordInputWrap}>
                  <TextInput
                    value={password}
                    onChangeText={handlePasswordChange}
                    secureTextEntry={!showPassword}
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Create password"
                    placeholderTextColor={COLORS.placeholder}
                    style={[
                      styles.input,
                      styles.passwordInput,
                    ]}
                    selectionColor={COLORS.text}
                  />

                  <Pressable
                    onPress={() =>
                      setShowPassword((current) => !current)
                    }
                    style={styles.eyeButton}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPassword
                        ? 'Hide password'
                        : 'Show password'
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

                <View style={styles.passwordRequirements}>
                  <PasswordRequirement
                    met={passwordLengthValid}
                    text="At least 6 characters"
                  />

                  <PasswordRequirement
                    met={passwordHasLetter}
                    text="At least 1 letter"
                  />

                  <PasswordRequirement
                    met={passwordHasNumber}
                    text="At least 1 number"
                  />

                  <PasswordRequirement
                    met={passwordHasSpecialCharacter}
                    text="At least 1 special character"
                  />
                </View>
              </View>

              {/* SIGN UP */}

              <Pressable
                onPress={handleSignUp}
                disabled={!canSubmit}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed &&
                    canSubmit &&
                    styles.buttonPressed,
                  !canSubmit &&
                    styles.buttonDisabled,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {submitting
                    ? 'Creating account...'
                    : usernameChecking
                      ? 'Checking username...'
                      : 'Sign Up'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.linkRow}>
              <Text style={styles.linkMuted}>
                Already have an account?
              </Text>

              <Link href="/login" asChild>
                <Pressable hitSlop={8}>
                  <Text style={styles.link}>
                    Sign In
                  </Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PasswordRequirement({
  met,
  text,
}: {
  met: boolean;
  text: string;
}) {
  return (
    <View style={styles.passwordRequirementRow}>
      {met ? (
        <Check
          size={14}
          color={COLORS.success}
          strokeWidth={3}
        />
      ) : (
        <X
          size={14}
          color={COLORS.error}
          strokeWidth={2.5}
        />
      )}

      <Text
        style={[
          styles.passwordRequirementText,
          met && styles.passwordRequirementTextMet,
        ]}
      >
        {text}
      </Text>
    </View>
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
    marginBottom: 20,
  },

  logoImage: {
    width: 92,
    height: 92,
    borderRadius: 46,
  },

  heading: {
    alignItems: 'center',
    marginBottom: 23,
  },

  title: {
    color: COLORS.text,
    fontFamily: 'Poppins-Bold',
    fontSize: 21,
    letterSpacing: -0.3,
    textAlign: 'center',
  },

  subtitle: {
    color: COLORS.muted,
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },

  errorBox: {
    backgroundColor: COLORS.errorBg,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
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
    marginBottom: 15,
  },

  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },

  label: {
    color: COLORS.text,
    fontFamily: 'Poppins-Medium',
    fontSize: 11.5,
    marginLeft: 3,
  },

  counter: {
    color: COLORS.muted,
    fontFamily: 'Poppins-Regular',
    fontSize: 10,
  },

  counterValid: {
    color: COLORS.success,
  },

  input: {
    width: '100%',
    minHeight: 50,
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

  usernameInputWrap: {
    position: 'relative',
  },

  usernameInput: {
    paddingRight: 48,
  },

  inputSuccess: {
    borderColor: '#357C55',
  },

  inputError: {
    borderColor: '#713535',
  },

  statusIcon: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },

  usernameHint: {
    marginTop: 6,
    marginHorizontal: 3,
    color: COLORS.muted,
    fontFamily: 'Poppins-Regular',
    fontSize: 10.5,
    lineHeight: 16,
  },

  usernameRequirement: {
    color: COLORS.error,
  },

  usernameSuccess: {
    color: COLORS.success,
  },

  usernameError: {
    color: COLORS.error,
  },

  passwordRequirements: {
    marginTop: 8,
    marginHorizontal: 3,
    gap: 4,
  },

  passwordRequirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 18,
  },

  passwordRequirementText: {
    marginLeft: 7,
    color: COLORS.error,
    fontFamily: 'Poppins-Regular',
    fontSize: 10.5,
    lineHeight: 16,
  },

  passwordRequirementTextMet: {
    color: COLORS.success,
  },

  primaryButton: {
    minHeight: 52,
    borderRadius: 15,
    backgroundColor: COLORS.charcoal,
    borderWidth: 1,
    borderColor: COLORS.charcoalLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
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
    opacity: 0.45,
  },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 21,
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
});