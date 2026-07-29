-- Run this in the Supabase SQL Editor (supabase.com → your project → SQL Editor)

create table workout_logs (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  date          text not null,
  name          text not null,
  duration      text,
  volume        float,
  sets          jsonb,
  created_at    timestamptz default now()
);

alter table workout_logs enable row level security;

create policy "Users manage own workout logs"
  on workout_logs for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


create table calorie_logs (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references auth.users(id) on delete cascade not null,
  date            text not null,
  foods           jsonb,
  total_calories  int,
  created_at      timestamptz default now()
);

alter table calorie_logs enable row level security;

create policy "Users manage own calorie logs"
  on calorie_logs for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


create table custom_workouts (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  name        text not null,
  exercises   jsonb not null default '[]',
  created_at  timestamptz default now()
);

alter table custom_workouts enable row level security;

create policy "Users manage own custom workouts"
  on custom_workouts for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
