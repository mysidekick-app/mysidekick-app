import { useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Check, X } from 'lucide-react-native';
import { Link, router } from 'expo-router';

import { useAuth } from '@/components/AuthProvider';
import {
  AuthScreenLayout,
  authStyles as s,
} from '@/components/auth/AuthScreenLayout';

import { supabase } from '@/lib/supabase';

export default function SignUpScreen() {
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(
    null
  );
  const [usernameError, setUsernameError] = useState<string | null>(null);

  /*
   * Username rules:
   *
   * - lowercase only
   * - letters allowed
   * - numbers allowed
   * - underscore allowed
   * - full stop allowed
   * - full stop must be between letters
   * - no spaces
   * - no other special characters
   *
   * Examples:
   *
   * john
   * john123
   * john_doe
   * john.doe
   * john.doe123
   * john_123
   *
   * Not allowed:
   *
   * .john
   * john.
   * john..doe
   * john._doe
   * john_.doe
   * john-doe
   * john doe
   * John
   */

  const isValidUsername = (value: string) => {
    if (!value) return false;

    /*
     * Must begin and end with a letter or number.
     */
    if (!/^[a-z0-9]/.test(value)) return false;
    if (!/[a-z0-9]$/.test(value)) return false;

    /*
     * Only lowercase letters, numbers, underscore and full stop.
     */
    if (!/^[a-z0-9_.]+$/.test(value)) return false;

    /*
     * Full stop must be between letters.
     *
     * This means:
     * john.doe     ✓
     * john.a       ✓
     * john.123     ✗
     * john_.doe    ✗
     * john._doe    ✗
     * john..doe    ✗
     */
    if (value.includes('.')) {
      if (!/[a-z]\.[a-z]/.test(value)) {
        return false;
      }

      /*
       * Every full stop must have a letter immediately
       * before and after it.
       */
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
    }

    return true;
  };

  /*
   * Check username availability against Supabase.
   */
  useEffect(() => {
    const cleanUsername = username.trim().toLowerCase();

    setUsernameAvailable(null);
    setUsernameError(null);

    if (!cleanUsername) {
      return;
    }

    if (!isValidUsername(cleanUsername)) {
      setUsernameError('Username format is not valid.');
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      setUsernameChecking(true);

      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('username', cleanUsername)
        .maybeSingle();

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

      if (data) {
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
    /*
     * Always store usernames in lowercase.
     */
    const lower = value.toLowerCase();

    setUsername(lower);

    /*
     * Clear general signup errors when the user edits
     * the username.
     */
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

    if (!isValidUsername(cleanUsername)) {
      setError('Please enter a valid username.');
      return;
    }

    /*
     * Do not allow signup until availability has been
     * confirmed by Supabase.
     */
    if (usernameChecking) {
      setError('Please wait while we check your username.');
      return;
    }

    if (usernameAvailable !== true) {
      setError('Please choose an available username.');
      return;
    }

    if (!cleanEmail || !password) {
      setError('Please enter your email and password.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);

    const result = await signUp(cleanEmail, password, {
      full_name: cleanFullName,
      username: cleanUsername,
    });

    setSubmitting(false);

    if (result.error) {
      /*
       * This also catches the rare case where another
       * user claims the username between our availability
       * check and the actual signup.
       */
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

    router.replace('/(tabs)' as never);
  };

  const usernameValid =
    username.length > 0 && isValidUsername(username);

  const showUsernameStatus =
    username.length > 0 && usernameValid;

  return (
    <AuthScreenLayout
      title="Create account"
      subtitle="Start managing your life simply"
    >
      {error ? <Text style={s.error}>{error}</Text> : null}

      <View style={s.field}>
        <Text style={s.label}>Full Name</Text>

        <TextInput
          value={fullName}
          onChangeText={(value) => {
            setFullName(value);

            if (error) {
              setError(null);
            }
          }}
          placeholder="John Doe"
          placeholderTextColor="#A4A09A"
          style={s.input}
          autoCapitalize="words"
          autoCorrect={false}
        />
      </View>

      <View style={s.field}>
        <Text style={s.label}>Username</Text>

        <View style={{ position: 'relative' }}>
          <TextInput
            value={username}
            onChangeText={handleUsernameChange}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            placeholder="johndoe"
            placeholderTextColor="#A4A09A"
            style={[
              s.input,
              {
                paddingRight: 48,
                borderColor:
                  usernameAvailable === true
                    ? '#3E9D66'
                    : usernameAvailable === false
                      ? '#C53A2F'
                      : undefined,
              },
            ]}
          />

          {showUsernameStatus ? (
            <View
              style={{
                position: 'absolute',
                right: 14,
                top: 0,
                bottom: 0,
                justifyContent: 'center',
              }}
            >
              {usernameChecking ? (
                <ActivityIndicator
                  size="small"
                  color="#8F8A82"
                />
              ) : usernameAvailable === true ? (
                <Check
                  size={20}
                  color="#3E9D66"
                  strokeWidth={3}
                />
              ) : usernameAvailable === false ? (
                <X
                  size={20}
                  color="#C53A2F"
                  strokeWidth={3}
                />
              ) : null}
            </View>
          ) : null}
        </View>

        {usernameError ? (
          <Text
            style={{
              marginTop: 6,
              fontFamily: 'Poppins-Regular',
              fontSize: 11,
              color:
                usernameAvailable === false
                  ? '#C53A2F'
                  : '#8F8A82',
            }}
          >
            {usernameError}
          </Text>
        ) : usernameAvailable === true ? (
          <Text
            style={{
              marginTop: 6,
              fontFamily: 'Poppins-Regular',
              fontSize: 11,
              color: '#3E9D66',
            }}
          >
            Username available
          </Text>
        ) : (
          <Text
            style={{
              marginTop: 6,
              fontFamily: 'Poppins-Regular',
              fontSize: 11,
              color: '#8F8A82',
            }}
          >
            Lowercase letters, numbers, underscores and dots between
            letters.
          </Text>
        )}
      </View>

      <View style={s.field}>
        <Text style={s.label}>Email</Text>

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
          placeholderTextColor="#A4A09A"
          style={s.input}
        />
      </View>

      <View style={s.field}>
        <Text style={s.label}>Password</Text>

        <TextInput
          value={password}
          onChangeText={(value) => {
            setPassword(value);

            if (error) {
              setError(null);
            }
          }}
          secureTextEntry
          autoComplete="new-password"
          placeholder="At least 6 characters"
          placeholderTextColor="#A4A09A"
          style={s.input}
        />
      </View>

      <Pressable
        onPress={handleSignUp}
        disabled={
          submitting ||
          usernameChecking ||
          usernameAvailable !== true
        }
        style={[
          s.primaryBtn,
          (submitting ||
            usernameChecking ||
            usernameAvailable !== true) &&
            s.disabled,
        ]}
      >
        <Text style={s.primaryBtnText}>
          {submitting
            ? 'Creating account...'
            : usernameChecking
              ? 'Checking username...'
              : 'Sign Up'}
        </Text>
      </Pressable>

      <View style={s.linkRow}>
        <Text style={s.linkMuted}>
          Already have an account?
        </Text>

        <Link href="/login" asChild>
          <Pressable>
            <Text style={s.link}>Sign In</Text>
          </Pressable>
        </Link>
      </View>
    </AuthScreenLayout>
  );
}
