import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useAuth } from '@/components/AuthProvider';
import { AuthScreenLayout, authStyles as s } from '@/components/auth/AuthScreenLayout';

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSignUp = async () => {
    setError(null);

    if (!fullName.trim()) return setError('Please enter your full name.');
    if (!username.trim()) return setError('Please choose a username.');
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) {
      return setError('Username must be 3–20 characters (letters, numbers, underscore).');
    }
    if (!email.trim() || !password) return setError('Please enter your email and password.');

    setSubmitting(true);
    const result = await signUp(email, password, {
      full_name: fullName.trim(),
      username: username.trim().toLowerCase(),
    });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
    } else {
      router.replace('/(tabs)' as never);
    }
  };

  return (
    <AuthScreenLayout title="Create account" subtitle="Start managing your life simply">
      {error ? <Text style={s.error}>{error}</Text> : null}
      
      <View style={s.field}>
        <Text style={s.label}>Full Name</Text>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="John Doe"
          placeholderTextColor="#A4A09A"
          style={s.input}
        />
      </View>

      <View style={s.field}>
        <Text style={s.label}>Username</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          placeholder="johndoe"
          placeholderTextColor="#A4A09A"
          style={s.input}
        />
      </View>

      <View style={s.field}>
        <Text style={s.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
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
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          placeholder="At least 6 characters"
          placeholderTextColor="#A4A09A"
          style={s.input}
        />
      </View>

      <Pressable
        onPress={handleSignUp}
        disabled={submitting}
        style={[s.primaryBtn, submitting && s.disabled]}
      >
        <Text style={s.primaryBtnText}>{submitting ? 'Creating account...' : 'Sign Up'}</Text>
      </Pressable>

      <View style={s.linkRow}>
        <Text style={s.linkMuted}>Already have an account?</Text>
        <Link href="/login" asChild>
          <Pressable><Text style={s.link}>Sign In</Text></Pressable>
        </Link>
      </View>
    </AuthScreenLayout>
  );
}