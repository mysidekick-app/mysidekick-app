import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useAuth } from '@/components/AuthProvider';
import { AuthScreenLayout, authStyles as s } from '@/components/auth/AuthScreenLayout';

export default function LoginScreen() {
  const { signIn, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleEmailLogin = async () => {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    } else {
      router.replace('/(tabs)' as never);
    }
  };

  if (authLoading) {
    return (
      <AuthScreenLayout title="Welcome back" subtitle="Loading...">
        <ActivityIndicator size="large" color="#2379E8" style={{ marginTop: 40 }} />
      </AuthScreenLayout>
    );
  }

  return (
    <AuthScreenLayout title="Welcome back" subtitle="Sign in to continue">
      {error ? <Text style={s.error}>{error}</Text> : null}
      
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
          placeholder="Your password"
          placeholderTextColor="#A4A09A"
          style={s.input}
        />
      </View>

      <Pressable
        onPress={handleEmailLogin}
        disabled={submitting}
        style={[s.primaryBtn, submitting && s.disabled]}
      >
        <Text style={s.primaryBtnText}>{submitting ? 'Signing in...' : 'Sign In'}</Text>
      </Pressable>

      <View style={s.linkRow}>
        <Text style={s.linkMuted}>New here?</Text>
        <Link href="/signup" asChild>
          <Pressable><Text style={s.link}>Create an account</Text></Pressable>
        </Link>
      </View>
    </AuthScreenLayout>
  );
}