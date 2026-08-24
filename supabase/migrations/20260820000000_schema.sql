-- Reset the public schema
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper function for updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 1. Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'User',
  title TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  currency_code TEXT NOT NULL DEFAULT 'USD',
  theme_mode TEXT NOT NULL DEFAULT 'system' CHECK (theme_mode IN ('system', 'light', 'dark')),
  accent_family TEXT NOT NULL DEFAULT 'red' CHECK (accent_family IN ('red', 'orange', 'mustard', 'green', 'blue', 'indigo', 'violet')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "profiles_delete_own" ON public.profiles FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 2. Social Profiles
CREATE TABLE IF NOT EXISTS public.social_profiles (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'User',
  username TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.social_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "social_profiles_select_authenticated" ON public.social_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "social_profiles_insert_own" ON public.social_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND id = auth.uid()::text);
CREATE POLICY "social_profiles_update_own" ON public.social_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND id = auth.uid()::text);
CREATE POLICY "social_profiles_delete_own" ON public.social_profiles FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 3. Game Sessions
CREATE TABLE IF NOT EXISTS public.game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game TEXT NOT NULL CHECK (game IN ('chess', 'tictactoe', 'sudoku', 'wordsearch', 'crossword')),
  opponent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "game_sessions_select_own" ON public.game_sessions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "game_sessions_insert_own" ON public.game_sessions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "game_sessions_update_own" ON public.game_sessions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "game_sessions_delete_own" ON public.game_sessions FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 4. Finance Transactions
CREATE TABLE IF NOT EXISTS public.finance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense', 'debt')),
  title TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  category TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_transactions_select_own" ON public.finance_transactions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "finance_transactions_insert_own" ON public.finance_transactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "finance_transactions_update_own" ON public.finance_transactions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "finance_transactions_delete_own" ON public.finance_transactions FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 5. Savings Goals
CREATE TABLE IF NOT EXISTS public.savings_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "savings_goals_select_own" ON public.savings_goals FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "savings_goals_insert_own" ON public.savings_goals FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "savings_goals_update_own" ON public.savings_goals FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "savings_goals_delete_own" ON public.savings_goals FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 6. Lists
CREATE TABLE IF NOT EXISTS public.lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lists_select_own" ON public.lists FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "lists_insert_own" ON public.lists FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "lists_update_own" ON public.lists FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "lists_delete_own" ON public.lists FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 7. List Items
CREATE TABLE IF NOT EXISTS public.list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "list_items_select_own" ON public.list_items FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "list_items_insert_own" ON public.list_items FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "list_items_update_own" ON public.list_items FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "list_items_delete_own" ON public.list_items FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 8. Wellbeing Modules
CREATE TABLE IF NOT EXISTS public.wellbeing_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL CHECK (module_key IN ('journaling', 'morning_pages', 'shadow_work', 'affirmations', 'mood_tracker', 'delights', 'period_tracker', 'breathwork')),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, module_key)
);

ALTER TABLE public.wellbeing_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wellbeing_modules_select_own" ON public.wellbeing_modules FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "wellbeing_modules_insert_own" ON public.wellbeing_modules FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "wellbeing_modules_update_own" ON public.wellbeing_modules FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "wellbeing_modules_delete_own" ON public.wellbeing_modules FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 9. Bookmarks
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT,
  category TEXT NOT NULL,
  tag TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookmarks_select_own" ON public.bookmarks FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "bookmarks_insert_own" ON public.bookmarks FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "bookmarks_update_own" ON public.bookmarks FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "bookmarks_delete_own" ON public.bookmarks FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 10. Habits
CREATE TABLE IF NOT EXISTS public.habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
  current_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  checkpoint INTEGER NOT NULL DEFAULT 5 CHECK (checkpoint > 0),
  trophies_earned INTEGER NOT NULL DEFAULT 0 CHECK (trophies_earned >= 0),
  freezes_held INTEGER NOT NULL DEFAULT 0 CHECK (freezes_held >= 0),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE CHECK (end_date IS NULL OR end_date >= start_date),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "habits_select_own" ON public.habits FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "habits_insert_own" ON public.habits FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "habits_update_own" ON public.habits FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "habits_delete_own" ON public.habits FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 11. Habit Completions
CREATE TABLE IF NOT EXISTS public.habit_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  habit_id UUID NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  completed_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (habit_id, completed_on)
);

ALTER TABLE public.habit_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "habit_completions_select_own" ON public.habit_completions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "habit_completions_insert_own" ON public.habit_completions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "habit_completions_update_own" ON public.habit_completions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "habit_completions_delete_own" ON public.habit_completions FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 12. Plants
CREATE TABLE IF NOT EXISTS public.plants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  species TEXT,
  watering_interval_days INTEGER NOT NULL DEFAULT 7 CHECK (watering_interval_days > 0),
  sunlight TEXT NOT NULL DEFAULT 'Indirect' CHECK (sunlight IN ('Low', 'Indirect', 'Bright', 'Direct')),
  last_watered_on DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.plants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plants_select_own" ON public.plants FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "plants_insert_own" ON public.plants FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "plants_update_own" ON public.plants FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "plants_delete_own" ON public.plants FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 13. Reminders
CREATE TABLE IF NOT EXISTS public.reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  due_date DATE NOT NULL,
  time TIME,
  category TEXT NOT NULL DEFAULT 'General',
  repeat TEXT NOT NULL DEFAULT 'none' CHECK (repeat IN ('none', 'daily', 'weekly', 'monthly', 'annually', 'custom')),
  repeat_interval INTEGER NOT NULL DEFAULT 1 CHECK (repeat_interval > 0),
  repeat_unit TEXT CHECK (repeat_unit IS NULL OR repeat_unit IN ('day', 'week', 'month', 'year')),
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reminders_select_own" ON public.reminders FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "reminders_insert_own" ON public.reminders FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "reminders_update_own" ON public.reminders FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "reminders_delete_own" ON public.reminders FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 14. Planner Tasks
CREATE TABLE IF NOT EXISTS public.planner_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  collaborator TEXT,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  repeat TEXT NOT NULL DEFAULT 'none' CHECK (repeat IN ('none', 'daily', 'weekly', 'monthly', 'yearly', 'custom')),
  repeat_interval INTEGER NOT NULL DEFAULT 1 CHECK (repeat_interval > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.planner_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planner_tasks_select_own" ON public.planner_tasks FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "planner_tasks_insert_own" ON public.planner_tasks FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "planner_tasks_update_own" ON public.planner_tasks FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "planner_tasks_delete_own" ON public.planner_tasks FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 15. Planner Subtasks
CREATE TABLE IF NOT EXISTS public.planner_subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.planner_tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.planner_subtasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planner_subtasks_select_own" ON public.planner_subtasks FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "planner_subtasks_insert_own" ON public.planner_subtasks FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "planner_subtasks_update_own" ON public.planner_subtasks FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "planner_subtasks_delete_own" ON public.planner_subtasks FOR DELETE TO authenticated USING (user_id = auth.uid());