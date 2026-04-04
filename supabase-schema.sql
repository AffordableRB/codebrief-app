-- CodeBrief Database Schema
-- Run this in your Supabase SQL Editor

-- Profiles table (extends Supabase auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  plan text not null default 'free' check (plan in ('free', 'solo', 'firm', 'enterprise')),
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Briefs table (stores generated compliance briefs)
create table if not exists public.briefs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  building_type text not null,
  location text not null,
  square_footage text,
  stories text,
  occupancy_type text,
  brief_content text not null,
  input_json jsonb,
  created_at timestamp with time zone default now()
);

-- Indexes
create index if not exists briefs_user_id_idx on public.briefs (user_id);
create index if not exists briefs_created_at_idx on public.briefs (created_at);
create index if not exists profiles_stripe_customer_id_idx on public.profiles (stripe_customer_id);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.briefs enable row level security;

-- Profiles: users can read/update their own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Briefs: users can CRUD their own briefs
create policy "Users can view own briefs"
  on public.briefs for select
  using (auth.uid() = user_id);

create policy "Users can insert own briefs"
  on public.briefs for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own briefs"
  on public.briefs for delete
  using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
