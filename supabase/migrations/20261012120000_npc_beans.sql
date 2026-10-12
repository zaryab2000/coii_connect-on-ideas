-- coii backend, part 7: 30 NPC beans (docs-internal/prd/npc-beans.md). Background walkers that
-- keep the venue moving after the launch-day demo purge, and are obviously not people:
--   - their own source, 'npc': purge_demo() (source = 'demo') and post_event_purge() leave them;
--   - venue flag bit 16, so maps draw them grey and keep them out of every list and count;
--   - inert on the server: no waves, contacts, picks, adda, reports or blocks.
-- The constraints name all four sources (claim-your-bean adds 'invited'), so this and that
-- migration apply cleanly in either order.

-- ---- the npc source ---------------------------------------------------------------------------

alter table private.people drop constraint if exists people_source_check;
alter table private.people add constraint people_source_check
  check (source in ('self', 'demo', 'invited', 'npc'));

-- Only people who joined have a login; demo, invited and NPC beans never do.
alter table private.people drop constraint if exists people_check;
alter table private.people drop constraint if exists people_login_check;
alter table private.people add constraint people_login_check
  check ((source in ('demo', 'invited', 'npc')) = (user_id is null));

-- Only people who joined gave consent; nobody else needs it.
alter table private.people drop constraint if exists people_check1;
alter table private.people drop constraint if exists people_consent_check;
alter table private.people add constraint people_consent_check
  check (source <> 'self' or consent_at is not null);

-- ---- the 30 NPCs (fixed ids, so running this again changes nothing) ---------------------------

insert into private.people (id, source, name, topics, skin, hair, hair_color, accessory)
values
  ('e0000000-0000-4000-8000-000000000001', 'npc', 'Chai Runner', array['ai'], 1, 5, 3, 2),
  ('e0000000-0000-4000-8000-000000000002', 'npc', 'Booth Hopper', array['prediction'], 2, 10, 6, 0),
  ('e0000000-0000-4000-8000-000000000003', 'npc', 'Lanyard Larry', array['defi','security'], 3, 3, 0, 2),
  ('e0000000-0000-4000-8000-000000000004', 'npc', 'Sticker Collector', array['privacy'], 4, 8, 3, 0),
  ('e0000000-0000-4000-8000-000000000005', 'npc', 'Gas Fee Guru', array['stablecoins'], 5, 1, 6, 2),
  ('e0000000-0000-4000-8000-000000000006', 'npc', 'Hallway Hustler', array['core','jobs'], 0, 6, 0, 0),
  ('e0000000-0000-4000-8000-000000000007', 'npc', 'Merch Hunter', array['security'], 1, 11, 3, 2),
  ('e0000000-0000-4000-8000-000000000008', 'npc', 'Wi-Fi Seeker', array['wallets'], 2, 4, 6, 0),
  ('e0000000-0000-4000-8000-000000000009', 'npc', 'Coffee Courier', array['consumer','defi'], 3, 9, 0, 2),
  ('e0000000-0000-4000-8000-000000000010', 'npc', 'Badge Scanner', array['jobs'], 4, 2, 3, 0),
  ('e0000000-0000-4000-8000-000000000011', 'npc', 'Seat Saver', array['ai'], 5, 7, 6, 2),
  ('e0000000-0000-4000-8000-000000000012', 'npc', 'Snack Scout', array['prediction','core'], 0, 0, 0, 0),
  ('e0000000-0000-4000-8000-000000000013', 'npc', 'Panel Lurker', array['defi'], 1, 5, 3, 2),
  ('e0000000-0000-4000-8000-000000000014', 'npc', 'Side Quest Sam', array['privacy'], 2, 10, 6, 0),
  ('e0000000-0000-4000-8000-000000000015', 'npc', 'Plug Point Pal', array['stablecoins','consumer'], 3, 3, 0, 2),
  ('e0000000-0000-4000-8000-000000000016', 'npc', 'Swag Bag Sid', array['core'], 4, 8, 3, 0),
  ('e0000000-0000-4000-8000-000000000017', 'npc', 'Queue Captain', array['security'], 5, 1, 6, 2),
  ('e0000000-0000-4000-8000-000000000018', 'npc', 'Map Wanderer', array['wallets','prediction'], 0, 6, 0, 0),
  ('e0000000-0000-4000-8000-000000000019', 'npc', 'Selfie Spotter', array['consumer'], 1, 11, 3, 2),
  ('e0000000-0000-4000-8000-000000000020', 'npc', 'Note Taker', array['jobs'], 2, 4, 6, 0),
  ('e0000000-0000-4000-8000-000000000021', 'npc', 'Water Bottle Vik', array['ai','stablecoins'], 3, 9, 0, 2),
  ('e0000000-0000-4000-8000-000000000022', 'npc', 'Hoodie Hero', array['prediction'], 4, 2, 3, 0),
  ('e0000000-0000-4000-8000-000000000023', 'npc', 'Chai Sipper', array['defi'], 5, 7, 6, 2),
  ('e0000000-0000-4000-8000-000000000024', 'npc', 'Floor Walker', array['privacy','wallets'], 0, 0, 0, 0),
  ('e0000000-0000-4000-8000-000000000025', 'npc', 'Booth Browser', array['stablecoins'], 1, 5, 3, 2),
  ('e0000000-0000-4000-8000-000000000026', 'npc', 'Lost & Found', array['core'], 2, 10, 6, 0),
  ('e0000000-0000-4000-8000-000000000027', 'npc', 'Echo Chamber', array['security','ai'], 3, 3, 0, 2),
  ('e0000000-0000-4000-8000-000000000028', 'npc', 'Venue Explorer', array['wallets'], 4, 8, 3, 0),
  ('e0000000-0000-4000-8000-000000000029', 'npc', 'Pigeon Watcher', array['consumer'], 5, 1, 6, 2),
  ('e0000000-0000-4000-8000-000000000030', 'npc', 'Gate Greeter', array['jobs','privacy'], 0, 6, 0, 0)
on conflict (id) do nothing;

-- ---- venue: flag bit 16 = npc -----------------------------------------------------------------

create or replace function private.people_columns(ids uuid[]) returns text
language sql stable security definer set search_path = ''
as $$
  with rows as (
    select p.*, coalesce(d.points, 0) as today
    from private.people p
    left join private.daily_points d
      on d.person_id = p.id and d.meet_day = private.current_meet_day()
    where p.id = any (ids) and p.status = 'visible'
  )
  select '{"id":[' || coalesce(string_agg(to_json(id::text)::text, ',' order by joined_at, id), '')
      || '],"n":[' || coalesce(string_agg(to_json(name)::text, ',' order by joined_at, id), '')
      || '],"t":[' || coalesce(string_agg(array_to_json(topics)::text, ',' order by joined_at, id), '')
      || '],"i":[' || coalesce(string_agg(array_to_json(intents)::text, ',' order by joined_at, id), '')
      || '],"o":[' || coalesce(string_agg(array_to_json(one_liners)::text, ',' order by joined_at, id), '')
      || '],"a":[' || coalesce(string_agg(
           '[' || skin || ',' || hair || ',' || hair_color || ',' || accessory || ']', ','
           order by joined_at, id), '')
      || '],"f":[' || coalesce(string_agg(
           ((telegram_verified::int) | (ticket_verified::int << 1) | ((source = 'demo')::int << 2)
            | ((source = 'npc')::int << 4))::text,
           ',' order by joined_at, id), '')
      || '],"p":[' || coalesce(string_agg(wave_points::text, ',' order by joined_at, id), '')
      || '],"d":[' || coalesce(string_agg(today::text, ',' order by joined_at, id), '')
      || '],"j":[' || coalesce(string_agg(floor(extract(epoch from joined_at))::bigint::text, ','
           order by joined_at, id), '')
      || ']}'
  from rows
$$;

-- ---- NPCs are inert ---------------------------------------------------------------------------

create or replace function public.wave(target uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
  target_status text;
  used integer;
  result text;
begin
  -- Caller first, then the pair, always in this order: no deadlocks, and two simultaneous
  -- mutual waves still make exactly one chai.
  perform pg_advisory_xact_lock(hashtextextended('wave:' || me.id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'pair:' || least(me.id::text, target::text) || ':' || greatest(me.id::text, target::text), 0));

  used := private.waves_used_today(me.id);
  -- NPCs (grey background beans) are not people: never waved at, so no row, quota or point.
  select status into target_status from private.people where id = target and source <> 'npc';
  if target_status is null or target = me.id or target_status <> 'visible'
     or me.status <> 'visible' or private.blocked_between(me.id, target) then
    return jsonb_build_object('result', 'unavailable', 'contacts', null, 'waves_left', 50 - used);
  end if;
  if exists (select 1 from private.waves where from_id = me.id and to_id = target) then
    return jsonb_build_object(
      'result', 'already', 'contacts', private.contacts_of(target), 'waves_left', 50 - used);
  end if;
  if used >= 50 then
    return jsonb_build_object('result', 'quota', 'contacts', null, 'waves_left', 0);
  end if;

  insert into private.waves (from_id, to_id, meet_day)
  values (me.id, target, private.current_meet_day());
  result := 'waved';
  if exists (select 1 from private.waves where from_id = target and to_id = me.id) then
    insert into private.chais (a_id, b_id)
    values (least(me.id, target), greatest(me.id, target))
    on conflict do nothing;
    result := 'chai';
  end if;
  return jsonb_build_object(
    'result', result, 'contacts', private.contacts_of(target), 'waves_left', 50 - used - 1);
end;
$$;

create or replace function public.hand_inputs(user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me private.people;
  today date := private.current_meet_day();
  hand private.daily_hands;
  excluded uuid[];
begin
  select * into me from private.people p where p.user_id = hand_inputs.user_id;
  if not found then
    raise exception 'coii:no_profile';
  end if;
  select * into hand from private.daily_hands h where h.person_id = me.id and h.meet_day = today;
  if not private.hand_needs_deal(hand) then
    return jsonb_build_object('ready', true, 'hand', private.hand_json(me.id, today));
  end if;

  excluded := array(
    select to_id from private.waves where from_id = me.id
    union select case when a_id = me.id then b_id else a_id end from private.chais
          where me.id in (a_id, b_id)
    union select skipped_id from private.skips where person_id = me.id and until_day > today
    union select blocked_id from private.blocks where blocker_id = me.id
    union select blocker_id from private.blocks where blocked_id = me.id
  );

  return jsonb_build_object(
    'ready', false,
    'day', today,
    'now', now(),
    'viewer', jsonb_build_object('id', me.id, 'name', me.name, 'topics', to_jsonb(me.topics),
      'intents', to_jsonb(me.intents), 'one_liners', to_jsonb(me.one_liners),
      'joined_at', me.joined_at, 'source', me.source),
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'topics', to_jsonb(p.topics),
        'intents', to_jsonb(p.intents), 'one_liners', to_jsonb(p.one_liners),
        'joined_at', p.joined_at, 'source', p.source))
      from private.people p
      where p.status = 'visible' and p.id <> me.id and p.source <> 'npc'
    ), '[]'),
    'excluded', to_jsonb(excluded),
    'recent_hands', coalesce((
      select jsonb_agg(jsonb_build_object('day', h.meet_day, 'cards', h.cards))
      from private.daily_hands h
      where h.person_id = me.id and h.meet_day between today - 3 and today - 1
    ), '[]'),
    'waved_at_viewer', coalesce((
      select jsonb_agg(from_id) from private.waves where to_id = me.id
    ), '[]'),
    -- Unanswered waves per eligible candidate (to spread attention). Every answered wave is a
    -- chai, so that's their points minus their chais: no scan of every wave in the venue.
    'inbound', coalesce((
      select jsonb_object_agg(p.id, p.wave_points - coalesce(c.n, 0))
      from private.people p
      left join (
        select x, count(*) as n
        from (select a_id as x from private.chais union all select b_id from private.chais) both_sides
        group by x
      ) c on c.x = p.id
      where p.status = 'visible'
        and p.id <> me.id
        and not (p.id = any (excluded))
        and p.wave_points > coalesce(c.n, 0)
    ), '{}'),
    'exposure', coalesce((
      select jsonb_object_agg(pid, n) from (
        select card ->> 'personId' as pid, count(*) as n
        from private.daily_hands h, jsonb_array_elements(h.cards) as card
        where h.meet_day = today group by 1
      ) x
    ), '{}'),
    'hands_today', (select count(*) from private.daily_hands where meet_day = today),
    'hand', case when hand.person_id is null then null
                 else jsonb_build_object('cards', hand.cards, 'bonus', hand.bonus) end
  );
end;
$$;

create or replace function private.reachable(me private.people, other uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select me.status = 'visible'
     and other <> me.id
     and exists (select 1 from private.people
                 where id = other and status = 'visible' and source <> 'npc')
     and not private.blocked_between(me.id, other)
$$;

create or replace function public.report(person uuid, reason text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
begin
  if reason is null or reason not in ('scam', 'impersonation', 'spam', 'inappropriate', 'other') then
    raise exception 'coii:invalid_reason';
  end if;
  -- Hidden people can't report anyone (a hidden scammer can't retaliate).
  if me.status <> 'visible' or person = me.id
     or not exists (select 1 from private.people where id = person and source <> 'npc') then
    return;
  end if;
  insert into private.reports (person_id, reporter_id, reason) values (person, me.id, reason)
  on conflict do nothing;
end;
$$;

create or replace function public.block(person uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
begin
  if person = me.id
     or not exists (select 1 from private.people where id = person and source <> 'npc') then
    return;
  end if;
  insert into private.blocks (blocker_id, blocked_id) values (me.id, person)
  on conflict do nothing;
  perform private.cut_ties(me.id, person);
end;
$$;

-- Removes every NPC, for when real people fill the venue. Admin only (SQL editor); not run now.
create function private.remove_npcs() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  removed integer;
begin
  delete from private.people where source = 'npc';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function private.remove_npcs() from public, anon, authenticated, service_role;
