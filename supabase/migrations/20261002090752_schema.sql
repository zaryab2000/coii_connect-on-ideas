-- coii backend, part 1: the private schema, helpers, tables and privileges.
-- Spec: docs/prd/database.md §6 (data model) and §12 (security).
--
-- Every table lives in `private`, which the Data API does not expose. The browser only ever calls
-- functions in `public` (later migrations), each with an explicit grant.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Functions in `public` get no execute grant unless a migration grants it explicitly.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges revoke execute on functions from public;

-- ---- reference values (mirror src/data/*; a parity test fails if they drift) ----------------

create function private.topic_ids() returns text[]
language sql immutable parallel safe set search_path = ''
as $$
  select array['ai', 'prediction', 'defi', 'privacy', 'stablecoins', 'core', 'security',
               'wallets', 'consumer', 'jobs']
$$;

create function private.intent_ids() returns text[]
language sql immutable parallel safe set search_path = ''
as $$
  select array['building', 'hiring', 'job_hunting', 'cofounder', 'raising', 'investing',
               'researching', 'learning', 'vibing']
$$;

-- ---- helpers ------------------------------------------------------------------------------

-- The Meet day a moment belongs to. Days roll at 06:00 IST = 00:30 UTC, exactly like meetDay()
-- in src/match/day.ts. (Never write `at time zone '+05:30'`: POSIX offsets are sign-inverted.)
create function private.meet_day(ts timestamptz) returns date
language sql immutable parallel safe set search_path = ''
as $$ select ((ts at time zone 'UTC') - interval '30 minutes')::date $$;

create function private.current_meet_day() returns date
language sql stable parallel safe set search_path = ''
as $$ select private.meet_day(now()) $$;

-- Server twin of containsLink() in src/data/handles.ts: http(s)://, www., or word.word where
-- the part after the dot is 2+ letters (claimdrop.ai, t.me). Numbers after the dot are fine
-- (v2.0). `\y` is a word boundary in Postgres.
create function private.has_link(t text) returns boolean
language sql immutable parallel safe set search_path = ''
as $$ select t ~* '(https?://|www\.|\y[a-z0-9-]+\.[a-z]{2,}\y)' $$;

-- Links in names (twin of nameHasLink() in src/data/handles.ts): http(s)://, www., the short
-- domains people paste (t.me, x.com, t.co), or 2+ characters, a dot and an all-lowercase or
-- all-caps ending. Initials pass (K.Ravi Kumar, A.R.Rahman, Dr.Anita Rao); the domain part is
-- deliberately case-sensitive. One-liners use the stricter has_link().
create function private.name_has_link(t text) returns boolean
language sql immutable parallel safe set search_path = ''
as $$
  select t ~* '(https?://|www\.|\y(t\.me|x\.com|t\.co)\y)'
      or t ~ '\y[A-Za-z0-9-]{2,}\.([a-z]{2,}|[A-Z]{2,})\y'
$$;

-- Server twin of containsMention() in src/data/oneLinerRules.ts: an @username.
create function private.has_mention(t text) returns boolean
language sql immutable parallel safe set search_path = ''
as $$ select t ~* '@[a-z0-9_]' $$;

-- Invisible and blank-rendering characters (soft hyphen, Hangul fillers, zero-width spaces and
-- joiners, bidi controls, the Braille blank, BOM).
-- They'd let "Dev<ZWSP>con" or "scam<ZWSP>.xyz" slip past the blocklist and link filter while
-- rendering like the blocked text, so they are removed before anything else. Same list as
-- INVISIBLE in src/data/handles.ts.
create function private.strip_invisible(t text) returns text
language sql immutable parallel safe set search_path = ''
as $$
  select regexp_replace(t,
    '[\u00AD\u115F\u1160\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u2800\u3164\uFEFF\uFFA0]',
    '', 'g')
$$;

-- Strip invisible characters, then trim and collapse runs of whitespace (newlines and Unicode
-- spaces included) to one space. Mirrors cleanText() in src/data/handles.ts.
create function private.clean_name(t text) returns text
language sql immutable parallel safe set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(private.strip_invisible(t),
                   '[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+', ' ', 'g'),
    '^ | $', '', 'g')
$$;

-- Mirrors cleanLines() in src/ui/joinDraft.ts: clean each line, drop blanks and case-insensitive
-- repeats, keep the original order. Validation (at most 3) happens afterwards.
create function private.clean_one_liners(lines text[]) returns text[]
language sql immutable parallel safe set search_path = ''
as $$
  select coalesce(array_agg(line order by first_at), '{}')
  from (
    select distinct on (lower(cleaned)) cleaned as line, ord as first_at
    from (
      select private.clean_name(raw) as cleaned, ord
      from unnest(coalesce(lines, '{}')) with ordinality as u(raw, ord)
      where raw is not null
    ) c
    where cleaned <> ''
    order by lower(cleaned), ord
  ) d
$$;

create function private.is_distinct_set(items text[]) returns boolean
language sql immutable parallel safe set search_path = ''
as $$ select cardinality(items) = (select count(distinct x) from unnest(items) as x) $$;

create function private.valid_one_liners(lines text[]) returns boolean
language sql immutable parallel safe set search_path = ''
as $$
  select cardinality(lines) <= 3
     and not exists (
       select 1 from unnest(lines) as line
       where line is null or char_length(line) not between 1 and 80
          or private.has_link(line) or private.has_mention(line)
     )
$$;

-- ---- tables -------------------------------------------------------------------------------

-- One row per bean. `id` is the public person id used everywhere in the app.
create table private.people (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid unique references auth.users (id) on delete cascade,
  source            text not null default 'self' check (source in ('self', 'demo')),
  name              text not null
                    check (char_length(name) between 1 and 40 and name = private.clean_name(name)),
  topics            text[] not null
                    check (cardinality(topics) between 1 and 3
                           and topics <@ private.topic_ids()
                           and private.is_distinct_set(topics)),
  intents           text[] not null default '{}'
                    check (cardinality(intents) <= 2
                           and intents <@ private.intent_ids()
                           and private.is_distinct_set(intents)),
  one_liners        text[] not null default '{}' check (private.valid_one_liners(one_liners)),
  skin              smallint not null check (skin between 0 and 5),
  hair              smallint not null check (hair between 0 and 11),
  hair_color        smallint not null check (hair_color between 0 and 8),
  accessory         smallint not null check (accessory between 0 and 3),
  telegram_verified boolean not null default false,
  ticket_verified   boolean not null default false,
  status            text not null default 'visible' check (status in ('visible', 'hidden')),
  -- Why a bean is hidden: 3+ unreviewed reports, impersonation (lost its only handle to a
  -- verified owner), or an admin decision. Null while visible.
  hidden_reason     text check (hidden_reason in ('reports', 'impersonation', 'admin')),
  wave_points       integer not null default 0 check (wave_points >= 0),
  consent_at        timestamptz,
  joined_at         timestamptz not null default now(),
  profile_at        timestamptz not null default now(),
  points_at         timestamptz not null default now(),
  check ((source = 'demo') = (user_id is null)),
  check (source = 'demo' or consent_at is not null),
  check ((status = 'hidden') = (hidden_reason is not null))
);

create index people_profile_at on private.people (profile_at);
create index people_points_at on private.people (points_at);
create index people_visible on private.people (id) where status = 'visible';

-- The only place handles live. Never part of the venue snapshot.
create table private.contacts (
  person_id        uuid primary key references private.people (id) on delete cascade,
  telegram         text check (telegram ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$'),
  x                text check (x ~ '^[A-Za-z0-9_]{1,15}$'),
  telegram_user_id bigint unique,
  check (telegram is not null or x is not null)
);

-- One handle can't sit on two beans: the impersonation guard.
create unique index contacts_telegram_unique on private.contacts (lower(telegram))
  where telegram is not null;
create unique index contacts_x_unique on private.contacts (lower(x)) where x is not null;

create table private.waves (
  from_id    uuid not null references private.people (id) on delete cascade,
  to_id      uuid not null references private.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  meet_day   date not null,
  primary key (from_id, to_id),
  check (from_id <> to_id)
);

create index waves_to on private.waves (to_id);
create index waves_day_to on private.waves (meet_day, to_id);

-- Waves sent per Meet day. Only ever goes up: unmatching or blocking removes a wave (and its
-- point) but never gives back the daily allowance, or the 50/day limit on unlocking handles
-- could be dodged by waving, blocking and waving again.
create table private.wave_quota (
  person_id uuid not null references private.people (id) on delete cascade,
  meet_day  date not null,
  sent      integer not null default 0 check (sent >= 0),
  primary key (person_id, meet_day)
);

-- Points received per Meet day (the Today board).
create table private.daily_points (
  meet_day  date not null,
  person_id uuid not null references private.people (id) on delete cascade,
  points    integer not null default 0 check (points >= 0),
  primary key (meet_day, person_id)
);

create index daily_points_person on private.daily_points (person_id);

-- Mutual waves ("Chai's on!"). Each side owns its own status and seen flag.
create table private.chais (
  a_id       uuid not null references private.people (id) on delete cascade,
  b_id       uuid not null references private.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  a_status   text not null default 'new' check (a_status in ('new', 'messaged', 'met')),
  b_status   text not null default 'new' check (b_status in ('new', 'messaged', 'met')),
  a_seen     boolean not null default false,
  b_seen     boolean not null default false,
  primary key (a_id, b_id),
  check (a_id < b_id)
);

create index chais_b on private.chais (b_id);

create table private.daily_hands (
  person_id  uuid not null references private.people (id) on delete cascade,
  meet_day   date not null,
  cards      jsonb not null default '[]' check (jsonb_typeof(cards) = 'array'),
  revealed   uuid[] not null default '{}',
  bonus      smallint not null default 0 check (bonus between 0 and 3),
  -- The bonus the stored cards were dealt for; a later bonus means a top-up is due.
  dealt_bonus smallint not null default 0 check (dealt_bonus between 0 and 3),
  -- Last deal attempt; a hand that came out short (few people yet) is re-dealt after 30 min.
  dealt_at   timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (person_id, meet_day)
);

create table private.skips (
  person_id  uuid not null references private.people (id) on delete cascade,
  skipped_id uuid not null references private.people (id) on delete cascade,
  until_day  date not null,
  primary key (person_id, skipped_id)
);

create index skips_skipped on private.skips (skipped_id);

create table private.blocks (
  blocker_id uuid not null references private.people (id) on delete cascade,
  blocked_id uuid not null references private.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index blocks_blocked on private.blocks (blocked_id);

create table private.reports (
  person_id   uuid not null references private.people (id) on delete cascade,
  reporter_id uuid not null references private.people (id) on delete cascade,
  reason      text not null
              check (reason in ('scam', 'impersonation', 'spam', 'inappropriate', 'other')),
  created_at  timestamptz not null default now(),
  -- Set when an admin un-hides the bean, so old reports don't count towards hiding it again.
  reviewed_at timestamptz,
  primary key (person_id, reporter_id),
  check (person_id <> reporter_id)
);

create index reports_reporter on private.reports (reporter_id);

-- Names containing any of these (lowercase) are refused. Edit in the table editor; no deploy.
create table private.blocked_terms (
  term text primary key check (term = lower(term) and term <> '')
);

insert into private.blocked_terms (term) values
  ('devcon'), ('support'), ('admin'), ('official'), ('ethereum foundation'), ('helpdesk'),
  ('airdrop'), ('coii'), ('moderator');

-- People who left the map (deleted or hidden), so open maps can remove them. No FK on purpose.
create table private.venue_tombstones (
  person_id  uuid primary key,
  removed_at timestamptz not null default now()
);

create index venue_tombstones_removed_at on private.venue_tombstones (removed_at);

-- ---- lock everything down -------------------------------------------------------------------

-- RLS on with no policies: defence in depth behind the unexposed schema.
alter table private.people enable row level security;
alter table private.contacts enable row level security;
alter table private.waves enable row level security;
alter table private.wave_quota enable row level security;
alter table private.daily_points enable row level security;
alter table private.chais enable row level security;
alter table private.daily_hands enable row level security;
alter table private.skips enable row level security;
alter table private.blocks enable row level security;
alter table private.reports enable row level security;
alter table private.blocked_terms enable row level security;
alter table private.venue_tombstones enable row level security;

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
