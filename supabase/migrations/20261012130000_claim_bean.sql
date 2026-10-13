-- coii backend, part 8: invited beans and claiming them (docs-internal/prd/claim-your-bean.md).
--
-- The owner adds real people who are coming to Devcon 8 as `invited` beans: on the map like
-- everyone else, owned by nobody, handles never shown, inert until claimed. Each one gets a
-- private single-use claim link. Claiming needs proof (the link, or a Telegram login with the
-- bean's exact username), records consent, and turns the bean into the claimer's own `self` bean.
--
-- Runs after part 7 (NPC beans): every function both parts define keeps the NPC exclusions too.

create extension if not exists pgcrypto with schema extensions;

-- ---- people: the invited source --------------------------------------------------------------

-- Part 7 already named these with all four sources; restating them keeps this file correct on its
-- own and changes nothing when part 7 has run.
alter table private.people drop constraint if exists people_source_check;
alter table private.people add constraint people_source_check
  check (source in ('self', 'demo', 'invited', 'npc'));

-- Only people who joined (or claimed) have a login; demo, invited and NPC beans never do.
alter table private.people drop constraint if exists people_check;
alter table private.people drop constraint if exists people_login_check;
alter table private.people add constraint people_login_check
  check ((source in ('demo', 'invited', 'npc')) = (user_id is null));

-- Only people who joined (or claimed) themselves gave consent.
alter table private.people drop constraint if exists people_check1;
alter table private.people drop constraint if exists people_consent_check;
alter table private.people add constraint people_consent_check
  check (source <> 'self' or consent_at is not null);

-- Claiming flips the venue's invited flag, so a change of source is a profile change too.
create or replace function private.on_people_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (new.name, new.topics, new.intents, new.one_liners, new.skin, new.hair, new.hair_color,
      new.accessory, new.telegram_verified, new.ticket_verified, new.status, new.source)
     is distinct from
     (old.name, old.topics, old.intents, old.one_liners, old.skin, old.hair, old.hair_color,
      old.accessory, old.telegram_verified, old.ticket_verified, old.status, old.source) then
    new.profile_at := now();
  end if;
  return new;
end;
$$;

-- ---- claim tokens -----------------------------------------------------------------------------

-- One live claim link per invited bean. Only the sha256 of the token is stored; the token itself
-- is returned once, to the owner, when it's made.
create table private.claim_tokens (
  person_id  uuid primary key references private.people (id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  -- The day after Devcon 8 ends.
  expires_at timestamptz not null default '2026-11-07 00:00:00+05:30',
  used_at    timestamptz
);

alter table private.claim_tokens enable row level security;
revoke all on private.claim_tokens from public, anon, authenticated;

create function private.claim_hash(token text) returns bytea
language sql immutable parallel safe set search_path = ''
as $$ select sha256(convert_to(token, 'UTF8')) $$;

-- A fresh claim link for this bean (any earlier one stops working). A link reissued close to or
-- after the default expiry still gets three days.
create function private.new_claim_url(person uuid) returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  token text := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
begin
  delete from private.claim_tokens where person_id = person;
  insert into private.claim_tokens (person_id, token_hash, expires_at)
  values (person, private.claim_hash(token),
          greatest(timestamptz '2026-11-07 00:00:00+05:30', now() + interval '3 days'));
  return 'https://coii.decipherclub.com/claim/' || token;
end;
$$;

-- ---- venue: bit 8 marks an invited (unclaimed) bean, bit 16 an NPC (part 7) --------------------

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
            | ((source = 'invited')::int << 3) | ((source = 'npc')::int << 4))::text,
           ',' order by joined_at, id), '')
      || '],"p":[' || coalesce(string_agg(wave_points::text, ',' order by joined_at, id), '')
      || '],"d":[' || coalesce(string_agg(today::text, ',' order by joined_at, id), '')
      || '],"j":[' || coalesce(string_agg(floor(extract(epoch from joined_at))::bigint::text, ','
           order by joined_at, id), '')
      || ']}'
  from rows
$$;

-- ---- handles: an invited bean's handle is "claim it", not "taken" ------------------------------------

-- Same rules as before. A handle held by an unclaimed invited bean raises coii:handle_invited with
-- that bean's id in DETAIL and the colliding handle ('telegram' or 'x') in HINT, so the app can
-- show whose bean it is. A handle held by anyone else is still coii:handle_taken.
create or replace function private.check_handles(person uuid, new_telegram text, new_x text)
returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  invited record;
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
    join private.people p on p.id = c.person_id
    where c.person_id is distinct from person
      and p.source <> 'invited'
      and ((new_telegram is not null and lower(c.telegram) = lower(new_telegram))
        or (new_x is not null and lower(c.x) = lower(new_x)))
  ) then
    raise exception 'coii:handle_taken';
  end if;
  select c.person_id,
         case when new_telegram is not null and lower(c.telegram) = lower(new_telegram)
              then 'telegram' else 'x' end as handle
    into invited
    from private.contacts c
    join private.people p on p.id = c.person_id
   where c.person_id is distinct from person
     and p.source = 'invited'
     and ((new_telegram is not null and lower(c.telegram) = lower(new_telegram))
       or (new_x is not null and lower(c.x) = lower(new_x)))
   order by 2  -- 'telegram' sorts before 'x': a Telegram collision is reported first
   limit 1;
  if invited.person_id is not null then
    raise exception 'coii:handle_invited'
      using detail = invited.person_id::text, hint = invited.handle;
  end if;
end;
$$;

-- ---- invited beans are inert until claimed ----------------------------------------------------------

create or replace function public.wave(target uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
  target_status text;
  target_source text;
  used integer;
  result text;
begin
  -- Caller first, then the pair, always in this order: no deadlocks, and two simultaneous
  -- mutual waves still make exactly one chai.
  perform pg_advisory_xact_lock(hashtextextended('wave:' || me.id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'pair:' || least(me.id::text, target::text) || ':' || greatest(me.id::text, target::text), 0));

  used := private.waves_used_today(me.id);
  -- NPCs (grey background beans, part 7) are not people: never waved at, so no row, quota or point.
  select status, source into target_status, target_source
    from private.people where id = target and source <> 'npc';
  if target_status is null or target = me.id or target_status <> 'visible'
     or me.status <> 'visible' or private.blocked_between(me.id, target) then
    return jsonb_build_object('result', 'unavailable', 'contacts', null, 'waves_left', 50 - used);
  end if;
  -- Nobody owns it yet: no wave row, no allowance used, no point, no handles.
  if target_source = 'invited' then
    return jsonb_build_object('result', 'unclaimed', 'contacts', null, 'waves_left', 50 - used);
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

-- Handles for people you have waved at (a chai means you have). Never an invited bean's.
create or replace function public.get_contacts(ids uuid[]) returns jsonb
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
    join private.people p
      on p.id = c.person_id and p.status = 'visible' and p.source <> 'invited'
    where c.person_id = any (ids)
  ), '[]'::jsonb);
end;
$$;

-- No adda invites to (or from) a bean nobody owns yet, or an NPC (part 7).
create or replace function private.reachable(me private.people, other uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select me.status = 'visible'
     and other <> me.id
     and exists (select 1 from private.people
                 where id = other and status = 'visible' and source not in ('invited', 'npc'))
     and not private.blocked_between(me.id, other)
$$;

-- Same as part 7, with invited beans left out too (never in Today's 3, nor counted as inbound).
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
      where p.status = 'visible' and p.source not in ('invited', 'npc') and p.id <> me.id
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
        and p.source not in ('invited', 'npc')
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

-- ---- claiming ---------------------------------------------------------------------------------------

-- Makes an invited bean `uid`'s own: owner, source, consent, and its claim link used up. The caller
-- has already checked the proof and that `uid` has no bean, and holds the person row lock.
create function private.claim_person(person uuid, uid uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update private.people
     set user_id = uid, source = 'self', consent_at = now(), profile_at = now()
   where id = person and source = 'invited';
  if not found then
    raise exception 'coii:claim_used';
  end if;
  update private.claim_tokens set used_at = coalesce(used_at, now()) where person_id = person;
end;
$$;

-- What a claim link shows before anyone claims it: the bean, never its handles. `status` is
-- 'ready', 'claimed', 'expired' or 'invalid' (only `status` is present for 'invalid'). An unclaimed
-- bean that was hidden (reported) reads as 'invalid': the owner reviews it before anyone takes it.
create function public.claim_preview(token text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  link private.claim_tokens;
  p private.people;
begin
  if token is null or char_length(token) not between 1 and 200 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into link from private.claim_tokens t where t.token_hash = private.claim_hash(token);
  if link.person_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into p from private.people where id = link.person_id;
  if p.source = 'invited' and p.status <> 'visible' then
    return jsonb_build_object('status', 'invalid');
  end if;
  return jsonb_build_object(
    'person_id', p.id,
    'name', p.name,
    'topics', to_jsonb(p.topics),
    'intents', to_jsonb(p.intents),
    'one_liners', to_jsonb(p.one_liners),
    'avatar', jsonb_build_array(p.skin, p.hair, p.hair_color, p.accessory),
    'status', case when link.used_at is not null or p.source <> 'invited' then 'claimed'
                   when link.expires_at <= now() then 'expired'
                   else 'ready' end
  );
end;
$$;

-- Claims the invited bean behind a claim link for the signed-in caller (who has no bean yet).
create function public.claim_bean(token text, consent boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  link private.claim_tokens;
  owner_source text;
  owner_status text;
begin
  if uid is null then
    raise exception 'coii:not_signed_in';
  end if;
  if exists (select 1 from private.people where user_id = uid) then
    raise exception 'coii:already_joined';
  end if;
  if consent is not true then
    raise exception 'coii:consent_required';
  end if;
  if token is null or char_length(token) not between 1 and 200 then
    raise exception 'coii:claim_invalid';
  end if;
  select * into link from private.claim_tokens t where t.token_hash = private.claim_hash(token);
  if link.person_id is null then
    raise exception 'coii:claim_invalid';
  end if;
  -- One claim at a time per bean: a second one waits here, then finds it claimed.
  select source, status into owner_source, owner_status
    from private.people where id = link.person_id for update;
  -- Re-read by this token, not by person: if the link was reissued (or the bean removed) while we
  -- waited, this token is gone and must not claim.
  select * into link from private.claim_tokens t where t.token_hash = private.claim_hash(token);
  if link.person_id is null or owner_source is null
     or (owner_source = 'invited' and owner_status <> 'visible') then
    raise exception 'coii:claim_invalid';
  end if;
  if link.expires_at <= now() then
    raise exception 'coii:claim_expired';
  end if;
  if link.used_at is not null or owner_source is distinct from 'invited' then
    raise exception 'coii:claim_used';
  end if;
  perform private.claim_person(link.person_id, uid);
  return private.me_json(link.person_id);
exception
  when unique_violation then
    -- This session's join raced the claim (people.user_id is unique).
    raise exception 'coii:already_joined';
end;
$$;

-- ---- Telegram: verifying the invited bean's username claims it ---------------------------------------

drop function public.link_telegram(uuid, bigint, text);

-- Verified Telegram login (§9.2), now also a way to claim. Without a bean, a username that matches
-- an invited bean's Telegram handle claims it (consent required); with a bean, a matching invited
-- bean is this same person, so it's deleted. Invited beans are never "impersonators".
create function public.link_telegram(
  user_id uuid,
  tg_id bigint,
  username text,
  consent boolean default false
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid;
  invited uuid;
  invited_status text;
  holder record;
begin
  select id into me from private.people p where p.user_id = link_telegram.user_id;
  if username is not null and username ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$' then
    select p.id, p.status into invited, invited_status
      from private.people p
      join private.contacts c on c.person_id = p.id
     where p.source = 'invited' and lower(c.telegram) = lower(username)
     for update of p;
  end if;

  if me is null then
    -- Without a bean, the only thing a Telegram login can do is claim a visible invited bean;
    -- anything else is the same "join first" it always was.
    if invited is null or invited_status <> 'visible' then
      raise exception 'coii:no_profile';
    end if;
    if consent is not true then
      raise exception 'coii:consent_required';
    end if;
    if exists (select 1 from private.contacts where telegram_user_id = tg_id and person_id <> invited) then
      raise exception 'coii:telegram_taken';
    end if;
    perform private.claim_person(invited, link_telegram.user_id);
    update private.contacts set telegram = username, telegram_user_id = tg_id
     where person_id = invited;
    update private.people set telegram_verified = true where id = invited;
    return private.me_json(invited);
  end if;

  if username is null or username !~ '^[A-Za-z][A-Za-z0-9_]{4,31}$' then
    raise exception 'coii:telegram_no_username';
  end if;
  if exists (select 1 from private.contacts where telegram_user_id = tg_id and person_id <> me) then
    raise exception 'coii:telegram_taken';
  end if;
  if invited is not null then
    delete from private.people where id = invited;
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

-- ---- admin: adding, re-linking and removing invited beans (owner, SQL editor; see the runbook) --------

-- Adds one invited bean and returns its id and claim link. The link is shown here once and never
-- stored. Same validation as joining; at least one handle; a null look gets a random one.
create function private.invite_bean(
  name text,
  topics text[],
  intents text[],
  one_liners text[],
  telegram text,
  x text,
  avatar smallint[] default null
) returns table (person_id uuid, claim_url text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  clean text := private.clean_name(name);
  lines text[] := private.clean_one_liners(one_liners);
  tg text := nullif(ltrim(btrim(telegram), '@'), '');
  xh text := nullif(ltrim(btrim(x), '@'), '');
  look smallint[] := coalesce(avatar, array[
    floor(random() * 6), floor(random() * 12), floor(random() * 9), floor(random() * 4)
  ]::smallint[]);
  person uuid;
begin
  perform private.check_profile(clean, topics, coalesce(intents, '{}'), lines, look);
  perform private.check_handles(null, tg, xh);
  insert into private.people
    (user_id, source, status, name, topics, intents, one_liners, skin, hair, hair_color, accessory)
  values
    (null, 'invited', 'visible', clean, topics, coalesce(intents, '{}'), lines,
     look[1], look[2], look[3], look[4])
  returning id into person;
  insert into private.contacts (person_id, telegram, x) values (person, tg, xh);
  return query select person, private.new_claim_url(person);
end;
$$;

-- Many invited beans in one call: `rows` is an array of objects with the invite_bean fields
-- (name, topics, intents, one_liners, telegram, x, avatar). All or nothing: the first bad row
-- raises "coii:<code> at row <n>" (1-based) and nothing is inserted.
create function private.invite_beans(rows jsonb) returns table (person_id uuid, claim_url text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  item jsonb;
  n bigint;
  added record;
  why text;
  which text;
begin
  if rows is null or jsonb_typeof(rows) <> 'array' then
    raise exception 'coii:invalid_rows';
  end if;
  for item, n in select value, ordinality from jsonb_array_elements(rows) with ordinality loop
    begin
      select * into added from private.invite_bean(
        item ->> 'name',
        array(select jsonb_array_elements_text(coalesce(item -> 'topics', '[]'))),
        array(select jsonb_array_elements_text(coalesce(item -> 'intents', '[]'))),
        array(select jsonb_array_elements_text(coalesce(item -> 'one_liners', '[]'))),
        item ->> 'telegram',
        item ->> 'x',
        case when jsonb_typeof(item -> 'avatar') = 'array'
             then array(select jsonb_array_elements_text(item -> 'avatar')::smallint)
             else null end
      );
    exception when others then
      get stacked diagnostics why = pg_exception_detail, which = pg_exception_hint;
      raise exception '% at row %', sqlerrm, n
        using detail = coalesce(why, ''), hint = coalesce(which, '');
    end;
    person_id := added.person_id;
    claim_url := added.claim_url;
    return next;
  end loop;
end;
$$;

-- A new claim link for an unclaimed invited bean; the old link stops working.
create function private.reissue_claim(person uuid) returns text
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not exists (select 1 from private.people where id = person and source = 'invited') then
    raise exception 'coii:not_invited';
  end if;
  return private.new_claim_url(person);
end;
$$;

-- Deletes an unclaimed invited bean (a removal request). Refuses anyone else's bean.
create function private.remove_invited(person uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  delete from private.people where id = person and source = 'invited';
  if not found then
    raise exception 'coii:not_invited';
  end if;
end;
$$;

-- ---- after the event ----------------------------------------------------------------------------

-- Same as part 5, plus unclaimed invited beans (their claim links go with them by cascade).
create or replace function private.post_event_purge() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from private.adda_members;
  delete from private.addas;
  delete from private.chais;
  delete from private.waves;
  delete from private.daily_points;
  delete from private.daily_hands;
  delete from private.skips;
  delete from private.wave_quota;
  delete from private.people where source = 'invited';
  if exists (select 1 from cron.job where jobname = 'post-event-purge') then
    perform cron.unschedule('post-event-purge');
  end if;
end;
$$;

-- ---- privileges ---------------------------------------------------------------------------------

-- Nothing in private is callable by the API roles; the admin functions run as the owner.
revoke all on all functions in schema private from public, anon, authenticated, service_role;
revoke all on all functions in schema public from public, anon, authenticated, service_role;

grant execute on function public.get_venue() to anon, authenticated;
grant execute on function public.get_venue_changes(timestamptz) to anon, authenticated;
grant execute on function public.claim_preview(text) to anon, authenticated;

grant execute on function public.get_me() to authenticated;
grant execute on function public.upsert_profile(text, text[], text[], text[], smallint[], text, text, boolean)
  to authenticated;
grant execute on function public.claim_bean(text, boolean) to authenticated;
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
grant execute on function public.create_adda(text, text, text) to authenticated;
grant execute on function public.update_adda(uuid, text, text, text) to authenticated;
grant execute on function public.delete_adda(uuid) to authenticated;
grant execute on function public.move_adda(uuid, text, real, real) to authenticated;
grant execute on function public.invite_to_adda(uuid, uuid) to authenticated;
grant execute on function public.remove_from_adda(uuid, uuid) to authenticated;
grant execute on function public.respond_to_adda_invite(uuid, boolean) to authenticated;
grant execute on function public.leave_adda(uuid) to authenticated;
grant execute on function public.get_adda_state() to authenticated;

grant execute on function public.hand_inputs(uuid) to service_role;
grant execute on function public.save_hand(uuid, date, jsonb, smallint) to service_role;
grant execute on function public.link_telegram(uuid, bigint, text, boolean) to service_role;
