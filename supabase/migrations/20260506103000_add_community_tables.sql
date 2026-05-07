create table if not exists public.community_rooms (
  id text primary key default gen_random_uuid()::text,
  slug text not null unique,
  name text not null,
  description text,
  admin_note text,
  marquee_notice text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_community_rooms_slug on public.community_rooms (slug);

create table if not exists public.community_messages (
  id text primary key default gen_random_uuid()::text,
  scope text not null check (scope in ('room', 'direct')),
  room_id text references public.community_rooms(id) on delete cascade,
  sender_member_key text not null,
  sender_name text not null,
  sender_role text not null check (sender_role in ('admin', 'user')),
  target_member_key text,
  target_name text,
  body text not null,
  image_url text,
  image_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_community_messages_room_id on public.community_messages (room_id);
create index if not exists idx_community_messages_scope on public.community_messages (scope);
create index if not exists idx_community_messages_sender_member_key on public.community_messages (sender_member_key);
create index if not exists idx_community_messages_target_member_key on public.community_messages (target_member_key);
create index if not exists idx_community_messages_created_at on public.community_messages (created_at asc);

alter table public.community_rooms enable row level security;
alter table public.community_messages enable row level security;

grant select, insert, update, delete on public.community_rooms to anon, authenticated;
grant select, insert, update, delete on public.community_messages to anon, authenticated;

drop policy if exists "community_rooms_full_access" on public.community_rooms;
create policy "community_rooms_full_access"
  on public.community_rooms
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "community_messages_full_access" on public.community_messages;
create policy "community_messages_full_access"
  on public.community_messages
  for all
  to anon, authenticated
  using (true)
  with check (true);
