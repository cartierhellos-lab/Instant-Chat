create extension if not exists pgcrypto;

create table if not exists public.sub_accounts (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  key text not null unique,
  role text not null check (role in ('admin', 'user')),
  assigned_phone_ids text[] not null default '{}',
  assigned_account_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  note text
);

create index if not exists idx_sub_accounts_key on public.sub_accounts (key);
create index if not exists idx_sub_accounts_role on public.sub_accounts (role);

create table if not exists public.textnow_accounts (
  id text primary key default gen_random_uuid()::text,
  phone_number text not null,
  username text not null,
  password text not null,
  email text not null,
  email_password text not null,
  raw text not null,
  status text not null default 'available'
    check (status in ('available', 'assigned', 'active', 'banned', 'cooling', 'injecting')),
  assigned_phone_id text,
  slot_index integer check (slot_index is null or slot_index between 0 and 9),
  imported_at timestamptz not null default now(),
  last_used_at timestamptz,
  banned_at timestamptz,
  send_count integer not null default 0,
  fail_count integer not null default 0,
  injected boolean not null default false
);

create index if not exists idx_textnow_accounts_status on public.textnow_accounts (status);
create index if not exists idx_textnow_accounts_assigned_phone on public.textnow_accounts (assigned_phone_id);
create index if not exists idx_textnow_accounts_phone_number on public.textnow_accounts (phone_number);

create table if not exists public.phone_bindings (
  phone_id text primary key,
  slots jsonb not null default '[null, null, null, null, null, null, null, null, null, null]'::jsonb,
  active_slot integer not null default 0 check (active_slot between 0 and 9)
);

create index if not exists idx_phone_bindings_phone_id on public.phone_bindings (phone_id);

create table if not exists public.broadcast_tasks (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  message text not null,
  image_url text,
  mode text not null check (mode in ('cloud_number', 'textnow')),
  target_numbers text[] not null default '{}',
  target_phones text[] not null default '{}',
  interval_min integer not null default 350,
  interval_max integer not null default 450,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'paused', 'completed', 'failed')),
  progress integer not null default 0 check (progress between 0 and 100),
  success_count integer not null default 0,
  fail_count integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  results jsonb not null default '[]'::jsonb,
  queue jsonb not null default '[]'::jsonb
);

create index if not exists idx_broadcast_tasks_status on public.broadcast_tasks (status);
create index if not exists idx_broadcast_tasks_created_at on public.broadcast_tasks (created_at desc);

create table if not exists public.sms_messages (
  id text primary key default gen_random_uuid()::text,
  number_id text not null,
  number text not null,
  message text not null,
  image_url text,
  code text,
  received_at timestamptz not null default now(),
  direction text not null check (direction in ('inbound', 'outbound')),
  status text check (status in ('sent', 'failed', 'pending'))
);

create index if not exists idx_sms_messages_number_id on public.sms_messages (number_id);
create index if not exists idx_sms_messages_received_at on public.sms_messages (received_at asc);
create index if not exists idx_sms_messages_direction on public.sms_messages (direction);

create table if not exists public.conversations (
  id text primary key default gen_random_uuid()::text,
  cloud_number_id text not null,
  cloud_number_number text not null,
  cloud_number_name text,
  cloud_number_status text check (cloud_number_status in ('online', 'offline', 'unknown')),
  contact_number text not null,
  unread_count integer not null default 0,
  last_updated timestamptz not null default now()
);

create index if not exists idx_conversations_cloud_number_id on public.conversations (cloud_number_id);
create index if not exists idx_conversations_contact_number on public.conversations (contact_number);
create index if not exists idx_conversations_last_updated on public.conversations (last_updated desc);
create unique index if not exists idx_conversations_unique_pair
  on public.conversations (cloud_number_id, contact_number);

alter table public.sub_accounts enable row level security;
alter table public.textnow_accounts enable row level security;
alter table public.phone_bindings enable row level security;
alter table public.broadcast_tasks enable row level security;
alter table public.sms_messages enable row level security;
alter table public.conversations enable row level security;

grant select, insert, update, delete on public.sub_accounts to anon, authenticated;
grant select, insert, update, delete on public.textnow_accounts to anon, authenticated;
grant select, insert, update, delete on public.phone_bindings to anon, authenticated;
grant select, insert, update, delete on public.broadcast_tasks to anon, authenticated;
grant select, insert, update, delete on public.sms_messages to anon, authenticated;
grant select, insert, update, delete on public.conversations to anon, authenticated;

drop policy if exists "sub_accounts_full_access" on public.sub_accounts;
create policy "sub_accounts_full_access"
  on public.sub_accounts
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "textnow_accounts_full_access" on public.textnow_accounts;
create policy "textnow_accounts_full_access"
  on public.textnow_accounts
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "phone_bindings_full_access" on public.phone_bindings;
create policy "phone_bindings_full_access"
  on public.phone_bindings
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "broadcast_tasks_full_access" on public.broadcast_tasks;
create policy "broadcast_tasks_full_access"
  on public.broadcast_tasks
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "sms_messages_full_access" on public.sms_messages;
create policy "sms_messages_full_access"
  on public.sms_messages
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "conversations_full_access" on public.conversations;
create policy "conversations_full_access"
  on public.conversations
  for all
  to anon, authenticated
  using (true)
  with check (true);
