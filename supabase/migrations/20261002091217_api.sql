-- coii backend, part 3: the API. Every function the browser or an Edge Function may call.
-- Spec: docs/prd/database.md §8 (contract), §12 (privileges).
--
-- All public functions are SECURITY DEFINER with an empty search_path and fully qualified names.
-- "Caller" means the bean whose user_id is the signed-in auth user. Failures raise `coii:<code>`.

-- ---- internal helpers ---------------------------------------------------------------------------

-- The caller's bean. Raises not_signed_in / no_profile.
create function private.caller() returns private.people
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  me private.people;
begin
  if uid is null then
    raise exception 'coii:not_signed_in';
  end if;
  select * into me from private.people where user_id = uid;
  if not found then
    raise exception 'coii:no_profile';
  end if;
  return me;
end;
$$;

create function private.blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  )
$$;

-- Waves sent today, from the counter that unmatch and block never lower.
create function private.waves_used_today(person uuid) returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce((select sent from private.wave_quota
                   where person_id = person and meet_day = private.current_meet_day()), 0)
$$;

create function private.contacts_of(person uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('telegram', c.telegram, 'x', c.x)
  from private.contacts c where c.person_id = person
$$;

-- Full profile of one bean, handles included. Only ever returned to its owner.
create function private.me_json(person uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'topics', to_jsonb(p.topics),
    'intents', to_jsonb(p.intents),
    'one_liners', to_jsonb(p.one_liners),
    'avatar', jsonb_build_array(p.skin, p.hair, p.hair_color, p.accessory),
    'telegram', c.telegram,
    'x', c.x,
    'telegram_verified', p.telegram_verified,
    'ticket_verified', p.ticket_verified,
    'status', p.status,
    'points', p.wave_points,
    'today_points', coalesce(d.points, 0),
    'joined_at', p.joined_at
  )
  from private.people p
  left join private.contacts c on c.person_id = p.id
  left join private.daily_points d
    on d.person_id = p.id and d.meet_day = private.current_meet_day()
  where p.id = person
$$;

-- Column-oriented venue data for a set of beans (§8.2), as compact JSON text. Arrays keep the
-- same order, sorted by joined_at. Built with string_agg so there is no whitespace padding.
create function private.people_columns(ids uuid[]) returns text
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
           ((telegram_verified::int) | (ticket_verified::int << 1) | ((source = 'demo')::int << 2))::text,
           ',' order by joined_at, id), '')
      || '],"p":[' || coalesce(string_agg(wave_points::text, ',' order by joined_at, id), '')
      || '],"d":[' || coalesce(string_agg(today::text, ',' order by joined_at, id), '')
      || '],"j":[' || coalesce(string_agg(floor(extract(epoch from joined_at))::bigint::text, ','
           order by joined_at, id), '')
      || ']}'
  from rows
$$;

create function private.venue_header() returns text
language sql stable security definer set search_path = ''
as $$
  select '"v":1,"cursor":' || to_json(now() - interval '5 seconds')::text
      || ',"day":' || to_json(private.current_meet_day())::text
$$;

-- ---- venue (anyone, signed in or not) ---------------------------------------------------------

create function public.get_venue() returns json
language sql stable security definer set search_path = ''
as $$
  select ('{' || private.venue_header() || ',' || substr(cols, 2))::json
  from (
    select private.people_columns(array(select id from private.people where status = 'visible'))
      as cols
  ) c
$$;

create function public.get_venue_changes(since timestamptz) returns json
language plpgsql stable security definer set search_path = ''
as $$
declare
  changed uuid[];
  scored text;
  removed text;
begin
  if since is null or since < now() - interval '30 days' or since > now() + interval '1 minute' then
    return '{"v":1,"full":true}'::json;
  end if;

  changed := array(select id from private.people where status = 'visible' and profile_at > since);

  select '{"id":[' || coalesce(string_agg(to_json(p.id::text)::text, ',' order by p.id), '')
      || '],"p":[' || coalesce(string_agg(p.wave_points::text, ',' order by p.id), '')
      || '],"d":[' || coalesce(string_agg(coalesce(d.points, 0)::text, ',' order by p.id), '')
      || ']}'
    into scored
    from private.people p
    left join private.daily_points d
      on d.person_id = p.id and d.meet_day = private.current_meet_day()
   where p.status = 'visible' and p.points_at > since and not (p.id = any (changed));

  select '[' || coalesce(string_agg(to_json(person_id::text)::text, ','), '') || ']'
    into removed
    from private.venue_tombstones where removed_at > since;

  return ('{' || private.venue_header()
          || ',"full":false,"people":' || private.people_columns(changed)
          || ',"points":' || scored
          || ',"removed":' || removed || '}')::json;
end;
$$;

-- ---- your profile ------------------------------------------------------------------------------

create function public.get_me() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  person uuid;
begin
  if uid is null then
    raise exception 'coii:not_signed_in';
  end if;
  select id into person from private.people where user_id = uid;
  return case when person is null then null else private.me_json(person) end;
end;
$$;

-- Validates everything a profile holds (§6.1) and raises the first problem as coii:<code>.
create function private.check_profile(
  clean_name text,
  topics text[],
  intents text[],
  lines text[],
  avatar smallint[]
) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if clean_name is null or char_length(clean_name) not between 1 and 40 then
    raise exception 'coii:invalid_name';
  end if;
  if private.name_has_link(clean_name) then
    raise exception 'coii:name_link_not_allowed';
  end if;
  if exists (select 1 from private.blocked_terms where position(term in lower(clean_name)) > 0) then
    raise exception 'coii:name_blocked';
  end if;
  if topics is null or cardinality(topics) not between 1 and 3
     or not topics <@ private.topic_ids() or not private.is_distinct_set(topics) then
    raise exception 'coii:invalid_topics';
  end if;
  if cardinality(intents) > 2 or not intents <@ private.intent_ids()
     or not private.is_distinct_set(intents) then
    raise exception 'coii:invalid_intents';
  end if;
  if exists (select 1 from unnest(lines) as l where private.has_link(l)) then
    raise exception 'coii:link_not_allowed';
  end if;
  if exists (select 1 from unnest(lines) as l where private.has_mention(l)) then
    raise exception 'coii:mention_not_allowed';
  end if;
  if cardinality(lines) > 3 or exists (select 1 from unnest(lines) as l where char_length(l) > 80) then
    raise exception 'coii:invalid_one_liner';
  end if;
  if avatar is null or cardinality(avatar) <> 4 or array_position(avatar, null) is not null
     or avatar[1] not between 0 and 5 or avatar[2] not between 0 and 11
     or avatar[3] not between 0 and 8 or avatar[4] not between 0 and 3 then
    raise exception 'coii:invalid_avatar';
  end if;
end;
$$;

-- Handles arrive normalised by normalizeTelegram / normalizeX; the server only validates.
create function private.check_handles(person uuid, new_telegram text, new_x text) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if new_telegram is null and new_x is null then
    raise exception 'coii:handle_required';
  end if;
  if new_telegram is not null and new_telegram !~ '^[A-Za-z][A-Za-z0-9_]{4,31}$' then
    raise exception 'coii:invalid_telegram';
  end if;
  if new_x is not null and new_x !~ '^[A-Za-z0-9_]{1,15}$' then
    raise exception 'coii:invalid_x';
  end if;
  if exists (
    select 1 from private.contacts c
    where c.person_id is distinct from person
      and ((new_telegram is not null and lower(c.telegram) = lower(new_telegram))
        or (new_x is not null and lower(c.x) = lower(new_x)))
  ) then
    raise exception 'coii:handle_taken';
  end if;
end;
$$;

create function public.upsert_profile(
  name text,
  topics text[],
  intents text[],
  one_liners text[],
  avatar smallint[],
  telegram text,
  x text,
  consent boolean
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean text := private.clean_name(name);
  lines text[] := private.clean_one_liners(one_liners);
  tg text := nullif(btrim(telegram), '');
  xh text := nullif(btrim(x), '');
  me private.people;
  old_tg text;
  violated text;
begin
  if uid is null then
    raise exception 'coii:not_signed_in';
  end if;
  select * into me from private.people where user_id = uid for update;
  perform private.check_profile(clean, topics, coalesce(intents, '{}'), lines, avatar);
  perform private.check_handles(me.id, tg, xh);

  if me.id is null then
    if consent is not true then
      raise exception 'coii:consent_required';
    end if;
    insert into private.people
      (user_id, source, name, topics, intents, one_liners, skin, hair, hair_color, accessory,
       consent_at)
    values
      (uid, 'self', clean, topics, coalesce(intents, '{}'), lines, avatar[1], avatar[2], avatar[3],
       avatar[4], now())
    returning * into me;
    insert into private.contacts (person_id, telegram, x) values (me.id, tg, xh);
  else
    select c.telegram into old_tg from private.contacts c where c.person_id = me.id;
    update private.people p
       set name = clean, topics = upsert_profile.topics, intents = coalesce(upsert_profile.intents, '{}'),
           one_liners = lines, skin = avatar[1], hair = avatar[2], hair_color = avatar[3],
           accessory = avatar[4],
           -- A verified profile that changes its Telegram handle is no longer verified.
           telegram_verified = p.telegram_verified and lower(coalesce(tg, '')) = lower(coalesce(old_tg, ''))
     where p.id = me.id;
    insert into private.contacts (person_id, telegram, x) values (me.id, tg, xh)
    on conflict (person_id) do update set telegram = excluded.telegram, x = excluded.x;
  end if;
  return private.me_json(me.id);
exception
  when unique_violation then
    get stacked diagnostics violated = constraint_name;
    if violated like 'contacts_%' then
      raise exception 'coii:handle_taken';
    end if;
    -- A second join from the same session raced the first (people.user_id is unique).
    raise exception 'coii:already_joined';
end;
$$;

-- ---- waves and contacts ------------------------------------------------------------------------

create function public.wave(target uuid) returns jsonb
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
  select status into target_status from private.people where id = target;
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

-- Handles for people you have waved at (a chai means you have). Everyone else is left out.
create function public.get_contacts(ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
begin
  if cardinality(ids) > 200 then
    raise exception 'coii:too_many';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.person_id, 'telegram', c.telegram, 'x', c.x))
    from private.contacts c
    join private.waves w on w.to_id = c.person_id and w.from_id = me.id
    join private.people p on p.id = c.person_id and p.status = 'visible'
    where c.person_id = any (ids)
  ), '[]'::jsonb);
end;
$$;

-- ---- Meet --------------------------------------------------------------------------------------

-- Today's hand without cards whose person is gone, hidden or blocked.
create function private.hand_json(me uuid, today date) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'cards', coalesce((
      select jsonb_agg(card order by ord)
      from jsonb_array_elements(h.cards) with ordinality as e(card, ord)
      join private.people p on p.id = (card ->> 'personId')::uuid
      where p.status = 'visible' and not private.blocked_between(me, p.id)
    ), '[]'::jsonb),
    'revealed', to_jsonb(h.revealed),
    'bonus', h.bonus
  )
  from private.daily_hands h
  where h.person_id = me and h.meet_day = today
$$;

-- Whether today's hand needs (re)dealing: none yet, a bonus card earned since the last deal, or
-- it came out short (few people had joined) and the last attempt was over 30 minutes ago.
create function private.hand_needs_deal(hand private.daily_hands) returns boolean
language sql stable set search_path = ''
as $$
  select hand.person_id is null
      or hand.bonus > hand.dealt_bonus
      or (jsonb_array_length(hand.cards) < 3 + hand.bonus
          and hand.dealt_at < now() - interval '30 minutes')
$$;

create function public.get_meet_state() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
  today date := private.current_meet_day();
  hand private.daily_hands;
begin
  select * into hand from private.daily_hands where person_id = me.id and meet_day = today;
  return jsonb_build_object(
    'day', today,
    'reset_at', ((today + 1)::timestamp + interval '30 minutes') at time zone 'UTC',
    'points', me.wave_points,
    'today_points', coalesce((select points from private.daily_points
                              where person_id = me.id and meet_day = today), 0),
    'waves_left', 50 - private.waves_used_today(me.id),
    'waved', coalesce((select jsonb_agg(to_id) from private.waves where from_id = me.id), '[]'),
    'skipped', coalesce((select jsonb_agg(skipped_id) from private.skips
                         where person_id = me.id and until_day > today), '[]'),
    'blocked', coalesce((select jsonb_agg(blocked_id) from private.blocks
                         where blocker_id = me.id), '[]'),
    -- A count only: nothing tells you who waved until it's mutual.
    'inbound', (select count(*) from private.waves w
                where w.to_id = me.id
                  and not exists (select 1 from private.waves r
                                  where r.from_id = me.id and r.to_id = w.from_id)),
    'chais', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', case when c.a_id = me.id then c.b_id else c.a_id end,
        'at', c.created_at,
        'status', case when c.a_id = me.id then c.a_status else c.b_status end,
        'seen', case when c.a_id = me.id then c.a_seen else c.b_seen end
      ) order by c.created_at)
      from private.chais c where me.id in (c.a_id, c.b_id)
    ), '[]'),
    'hand', coalesce(private.hand_json(me.id, today),
                     jsonb_build_object('cards', '[]'::jsonb, 'revealed', '[]'::jsonb, 'bonus', 0)),
    'deal_needed', private.hand_needs_deal(hand)
  );
end;
$$;

create function public.reveal_card(person uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
begin
  update private.daily_hands h
     set revealed = case when person = any (h.revealed) then h.revealed
                         else array_append(h.revealed, person) end
   where h.person_id = me.id and h.meet_day = private.current_meet_day()
     and exists (select 1 from jsonb_array_elements(h.cards) as card
                 where card ->> 'personId' = person::text);
  if not found then
    raise exception 'coii:not_in_hand';
  end if;
end;
$$;

create function private.skip_for_a_week(me uuid, person uuid) returns void
language sql security definer set search_path = ''
as $$
  insert into private.skips (person_id, skipped_id, until_day)
  values (me, person, private.current_meet_day() + 7)
  on conflict (person_id, skipped_id) do update set until_day = excluded.until_day
$$;

create function public.skip(person uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
begin
  if person <> me.id and exists (select 1 from private.people where id = person) then
    perform private.skip_for_a_week(me.id, person);
  end if;
end;
$$;

-- Forward only: new → messaged → met. Meeting in person earns a bonus card today (max 3).
create function public.set_chai_status(person uuid, status text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
  a uuid := least(me.id, person);
  b uuid := greatest(me.id, person);
  mine text;
  rank_of constant jsonb := '{"new":0,"messaged":1,"met":2}'::jsonb;
  awarded boolean := false;
begin
  if status is null or not (rank_of ? status) then
    raise exception 'coii:invalid_status';
  end if;
  select case when me.id = a then a_status else b_status end into mine
    from private.chais where a_id = a and b_id = b for update;
  if mine is null then
    raise exception 'coii:no_chai';
  end if;
  if (rank_of ->> status)::int <= (rank_of ->> mine)::int then
    return jsonb_build_object('bonus_awarded', false);
  end if;
  update private.chais
     set a_status = case when me.id = a then status else a_status end,
         b_status = case when me.id = b then status else b_status end
   where a_id = a and b_id = b;
  if status = 'met' then
    update private.daily_hands set bonus = bonus + 1
     where person_id = me.id and meet_day = private.current_meet_day() and bonus < 3;
    awarded := found;
  end if;
  return jsonb_build_object('bonus_awarded', awarded);
end;
$$;

create function public.dismiss_chai(person uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
begin
  update private.chais
     set a_seen = a_seen or me.id = a_id, b_seen = b_seen or me.id = b_id
   where a_id = least(me.id, person) and b_id = greatest(me.id, person);
  if not found then
    raise exception 'coii:no_chai';
  end if;
end;
$$;

-- Removes the chai (if any) and both waves of a pair: both points and both unlocks go.
create function private.cut_ties(me uuid, person uuid) returns void
language sql security definer set search_path = ''
as $$
  delete from private.chais where a_id = least(me, person) and b_id = greatest(me, person);
  delete from private.waves
   where (from_id = me and to_id = person) or (from_id = person and to_id = me);
$$;

create function public.unmatch(person uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
begin
  if not exists (select 1 from private.chais
                 where a_id = least(me.id, person) and b_id = greatest(me.id, person)) then
    raise exception 'coii:no_chai';
  end if;
  perform private.cut_ties(me.id, person);
  perform private.skip_for_a_week(me.id, person);
end;
$$;

create function public.block(person uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
begin
  if person = me.id or not exists (select 1 from private.people where id = person) then
    return;
  end if;
  insert into private.blocks (blocker_id, blocked_id) values (me.id, person)
  on conflict do nothing;
  perform private.cut_ties(me.id, person);
end;
$$;

create function public.report(person uuid, reason text) returns void
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
     or not exists (select 1 from private.people where id = person) then
    return;
  end if;
  insert into private.reports (person_id, reporter_id, reason) values (person, me.id, reason)
  on conflict do nothing;
end;
$$;

-- ---- for Edge Functions (service role only) -----------------------------------------------------

-- Everything deal-hand needs to build a hand with src/match/hand.ts, in one round trip (§9.1).
-- When today's hand is already current it returns `{ ready: true, hand }` straight away, so
-- repeat calls stay cheap.
create function public.hand_inputs(user_id uuid) returns jsonb
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
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'topics', to_jsonb(p.topics),
        'intents', to_jsonb(p.intents), 'one_liners', to_jsonb(p.one_liners),
        'joined_at', p.joined_at, 'source', p.source))
      from private.people p where p.status = 'visible' and p.id <> me.id
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
    -- Unanswered waves per eligible candidate (to spread attention), not for the whole venue.
    'inbound', coalesce((
      select jsonb_object_agg(to_id, n) from (
        select w.to_id, count(*) as n
        from private.waves w
        join private.people p on p.id = w.to_id and p.status = 'visible'
        where w.to_id <> me.id
          and not (w.to_id = any (excluded))
          and not exists (select 1 from private.waves r
                          where r.from_id = w.to_id and r.to_id = w.from_id)
        group by w.to_id
      ) i
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

-- Stores a dealt hand and the bonus it was dealt for (the bonus can grow between hand_inputs
-- and here; then the hand stays due for a top-up). A racing second deal only replaces the cards
-- if it holds more of them.
create function public.save_hand(user_id uuid, day date, cards jsonb, dealt_bonus smallint)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid;
begin
  select id into me from private.people p where p.user_id = save_hand.user_id;
  if me is null then
    raise exception 'coii:no_profile';
  end if;
  if jsonb_typeof(cards) <> 'array' or save_hand.dealt_bonus not between 0 and 3 then
    raise exception 'coii:invalid_hand';
  end if;
  insert into private.daily_hands (person_id, meet_day, cards, dealt_bonus, dealt_at)
  values (me, day, cards, save_hand.dealt_bonus, now())
  on conflict (person_id, meet_day) do update
    set cards = case when jsonb_array_length(excluded.cards)
                          > jsonb_array_length(private.daily_hands.cards)
                     then excluded.cards else private.daily_hands.cards end,
        dealt_bonus = greatest(private.daily_hands.dealt_bonus, excluded.dealt_bonus),
        dealt_at = now();
  return private.hand_json(me, day);
end;
$$;

-- Verified Telegram login (§9.2): one bean per Telegram account; the verified owner of a username
-- takes it from any other bean.
create function public.link_telegram(user_id uuid, tg_id bigint, username text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid;
  holder record;
begin
  select id into me from private.people p where p.user_id = link_telegram.user_id;
  if me is null then
    raise exception 'coii:no_profile';
  end if;
  if username is null or username !~ '^[A-Za-z][A-Za-z0-9_]{4,31}$' then
    raise exception 'coii:telegram_no_username';
  end if;
  if exists (select 1 from private.contacts where telegram_user_id = tg_id and person_id <> me) then
    raise exception 'coii:telegram_taken';
  end if;
  for holder in
    select c.person_id, c.x from private.contacts c
    where lower(c.telegram) = lower(username) and c.person_id <> me
  loop
    if holder.x is null then
      -- Its only handle was someone else's: it was impersonating.
      delete from private.contacts where person_id = holder.person_id;
      update private.people
         set status = 'hidden', hidden_reason = 'impersonation', telegram_verified = false
       where id = holder.person_id;
    else
      update private.contacts set telegram = null where person_id = holder.person_id;
      update private.people set telegram_verified = false where id = holder.person_id;
    end if;
  end loop;
  insert into private.contacts (person_id, telegram, telegram_user_id)
  values (me, username, tg_id)
  on conflict (person_id) do update
    set telegram = excluded.telegram, telegram_user_id = excluded.telegram_user_id;
  update private.people set telegram_verified = true where id = me;
  return private.me_json(me);
end;
$$;

-- ---- privileges --------------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated, service_role;

grant execute on function public.get_venue() to anon, authenticated;
grant execute on function public.get_venue_changes(timestamptz) to anon, authenticated;

grant execute on function public.get_me() to authenticated;
grant execute on function public.upsert_profile(text, text[], text[], text[], smallint[], text, text, boolean)
  to authenticated;
grant execute on function public.wave(uuid) to authenticated;
grant execute on function public.get_contacts(uuid[]) to authenticated;
grant execute on function public.get_meet_state() to authenticated;
grant execute on function public.reveal_card(uuid) to authenticated;
grant execute on function public.skip(uuid) to authenticated;
grant execute on function public.set_chai_status(uuid, text) to authenticated;
grant execute on function public.dismiss_chai(uuid) to authenticated;
grant execute on function public.unmatch(uuid) to authenticated;
grant execute on function public.block(uuid) to authenticated;
grant execute on function public.report(uuid, text) to authenticated;

grant execute on function public.hand_inputs(uuid) to service_role;
grant execute on function public.save_hand(uuid, date, jsonb, smallint) to service_role;
grant execute on function public.link_telegram(uuid, bigint, text) to service_role;
