import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  '';

const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  '';

if (!supabaseUrl) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL');
}

if (!supabaseAnonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

/*
 * Persist the Supabase session on the device.
 *
 * This is what allows a user to close/reopen the app, or restart their phone,
 * and still have their login restored automatically.
 *
 * Each device stores its own session locally. Signing in on another device
 * therefore creates another local session instead of replacing this one.
 */
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);

supabase
  .from('wellbeing_modules')
  .select('module_key')
  .limit(1)
  .then(({ data, error }) => {
    console.log('SUPABASE TEST DATA:', data);
    console.log('SUPABASE TEST ERROR:', error);
  });

console.log('SUPABASE KEY EXISTS:', !!supabaseAnonKey);
console.log('SUPABASE CLIENT:', !!supabase);
