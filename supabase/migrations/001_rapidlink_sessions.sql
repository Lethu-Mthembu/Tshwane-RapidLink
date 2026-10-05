create extension if not exists pgcrypto;

create table if not exists public.rapidlink_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  state jsonb not null,
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

alter table public.rapidlink_sessions enable row level security;
alter publication supabase_realtime add table public.rapidlink_sessions;

create policy "active prototype rooms are readable"
on public.rapidlink_sessions for select to anon
using (expires_at > now());

insert into storage.buckets (id, name, public)
values ('rapidlink-media', 'rapidlink-media', false)
on conflict (id) do update set public = false;

-- The service-role key is used only by protected Vercel Functions. No anonymous writes are allowed.
