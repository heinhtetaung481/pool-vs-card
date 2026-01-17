-- Enable the Realtime extension
drop publication if exists supabase_realtime;
create publication supabase_realtime;

-- 1. Profiles Table
create table public.profiles (
  id uuid references auth.users not null primary key,
  username text unique,
  avatar_url text,
  updated_at timestamp with time zone,
  
  constraint username_length check (char_length(username) >= 3)
);

-- 2. Game Rooms Table
create table public.game_rooms (
  id uuid default gen_random_uuid() primary key,
  created_by uuid references public.profiles(id) not null,
  status text not null check (status in ('waiting', 'playing', 'finished', 'closed')) default 'waiting',
  settings jsonb not null default '{}'::jsonb, -- stores num_players, cards_per_hand, joker_price, end_game_price
  -- Turn System
  current_turn uuid references public.profiles(id),
  turn_order jsonb, -- array of user_ids in order
  deck_state jsonb, -- array of remaining card_values (1-52)
  round_number int default 1,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Game Players Table
create table public.game_players (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references public.game_rooms(id) on delete cascade not null,
  user_id uuid references public.profiles(id) not null,
  has_license boolean default false,
  cards_remaining_count int default 0,
  score int default 0,
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  unique(game_id, user_id)
);

-- 4. Player Cards Table
create table public.player_cards (
  id uuid default gen_random_uuid() primary key,
  player_id uuid references public.game_players(id) on delete cascade not null,
  card_value int not null check (card_value between 1 and 52), -- 1-52 (A-K per suit)
  is_down boolean default false,
  is_revealed boolean default false
);

-- 5. Game Events Table (Log)
create table public.game_events (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references public.game_rooms(id) on delete cascade not null,
  event_type text not null, -- ball_sunk, joker_scored, game_start, game_end
  payload jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Realtime for specific tables
alter publication supabase_realtime add table public.game_rooms;
alter publication supabase_realtime add table public.game_players;
alter publication supabase_realtime add table public.player_cards;
alter publication supabase_realtime add table public.game_events;

-- RLS Policies (Basic Setup - refine as needed)
alter table public.profiles enable row level security;
alter table public.game_rooms enable row level security;
alter table public.game_players enable row level security;
alter table public.player_cards enable row level security;
alter table public.game_events enable row level security;

-- Policies
-- Profiles: Public read, owner update
create policy "Public profiles are viewable by everyone." on public.profiles for select using (true);
create policy "Users can insert their own profile." on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile." on public.profiles for update using (auth.uid() = id);

-- Game Rooms: Public read/insert (for now)
create policy "Game rooms are viewable by everyone." on public.game_rooms for select using (true);
create policy "Authenticated users can create rooms." on public.game_rooms for insert with check (auth.role() = 'authenticated');
create policy "Room creator can update room." on public.game_rooms for update using (auth.uid() = created_by);

-- Game Players: Viewable by everyone in the room (or public for simplicity first)
create policy "Game players are viewable by everyone." on public.game_players for select using (true);
create policy "Authenticated users can join." on public.game_players for insert with check (auth.role() = 'authenticated');
-- Updates handled by server actions usually, but allow self-update?? No, safer to rely on Service Role for critical game logic updates or strict policies. 
-- For MVP, allow read-all.

-- Player Cards:
-- Crucial: Players should only see their own cards unless revealed.
-- But for "Opponent View", we need to know count (which is on game_players).
-- We need to know IF cards are down? 
-- Realtime sends the whole row. If we want to hide card_value from opponents, we might need a separate mechanism or View.
-- However, User Requirement: "Do not show their unrevealed cards."
-- RLS Policy:
-- Select: (auth.uid() is the owner of the card's player) OR (is_revealed = true) OR (is_down = true? - prompt says "card X must reveal it" so implies revealed).
-- Actually, prompt says: "If any player sinks Ball X, all players holding Card X must reveal it and mark it as 'Down'."
-- So everyone can see Down cards.
-- So policy: OWNER or IS_REVEALED or IS_DOWN.

create policy "See own cards or revealed/down cards" on public.player_cards
for select using (
  (select user_id from public.game_players where id = player_id) = auth.uid()
  or is_revealed = true
  or is_down = true
);

-- Game Events: Public read
create policy "Events viewable by everyone" on public.game_events for select using (true);

-- Enable Realtime for tables
-- This allows Supabase Realtime to broadcast changes
alter publication supabase_realtime add table public.game_rooms;
alter publication supabase_realtime add table public.game_players;
alter publication supabase_realtime add table public.player_cards;
alter publication supabase_realtime add table public.game_events;
