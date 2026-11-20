-- Tablas para hábitos y sus días cumplidos.
-- Ejecuta este archivo en Supabase > SQL Editor > New query.

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);

create table if not exists public.habit_completions (
  habit_id uuid not null references public.habits (id) on delete cascade,
  completed_on date not null,
  primary key (habit_id, completed_on)
);

create index if not exists habits_user_id_created_at_idx
  on public.habits (user_id, created_at);

alter table public.habits enable row level security;
alter table public.habit_completions enable row level security;

-- Solo usuarios con sesión pueden usar estas tablas.
revoke all on table public.habits from public, anon, authenticated;
revoke all on table public.habit_completions from public, anon, authenticated;
grant select, insert, update, delete on table public.habits to authenticated;
grant select, insert, update, delete on table public.habit_completions to authenticated;

-- El dueño de cada hábito puede ver y cambiar solo sus hábitos.
drop policy if exists "Cada persona ve sus hábitos" on public.habits;
create policy "Cada persona ve sus hábitos"
  on public.habits for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Cada persona crea sus hábitos" on public.habits;
create policy "Cada persona crea sus hábitos"
  on public.habits for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Cada persona cambia sus hábitos" on public.habits;
create policy "Cada persona cambia sus hábitos"
  on public.habits for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Cada persona borra sus hábitos" on public.habits;
create policy "Cada persona borra sus hábitos"
  on public.habits for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Una marca diaria solo se puede usar si pertenece a un hábito propio.
drop policy if exists "Cada persona ve sus marcas" on public.habit_completions;
create policy "Cada persona ve sus marcas"
  on public.habit_completions for select to authenticated
  using (
    exists (
      select 1 from public.habits
      where habits.id = habit_completions.habit_id
        and habits.user_id = (select auth.uid())
    )
  );

drop policy if exists "Cada persona crea sus marcas" on public.habit_completions;
create policy "Cada persona crea sus marcas"
  on public.habit_completions for insert to authenticated
  with check (
    exists (
      select 1 from public.habits
      where habits.id = habit_completions.habit_id
        and habits.user_id = (select auth.uid())
    )
  );

drop policy if exists "Cada persona cambia sus marcas" on public.habit_completions;
create policy "Cada persona cambia sus marcas"
  on public.habit_completions for update to authenticated
  using (
    exists (
      select 1 from public.habits
      where habits.id = habit_completions.habit_id
        and habits.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.habits
      where habits.id = habit_completions.habit_id
        and habits.user_id = (select auth.uid())
    )
  );

drop policy if exists "Cada persona borra sus marcas" on public.habit_completions;
create policy "Cada persona borra sus marcas"
  on public.habit_completions for delete to authenticated
  using (
    exists (
      select 1 from public.habits
      where habits.id = habit_completions.habit_id
        and habits.user_id = (select auth.uid())
    )
  );
