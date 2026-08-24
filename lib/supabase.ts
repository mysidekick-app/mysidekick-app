import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

