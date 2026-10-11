-- coii backend, part 5: adda, up to three crews per person, each in a tent on the map.
-- Spec: docs/prd/iteration_v2_feature.md.

-- ---- tables -----------------------------------------------------------------------------------

-- Waves sent by accepting an adda invite are free: they never use the daily allowance.
alter table private.waves add column free boolean not null default false;

-- Up to three addas per person: a name, how the tent looks, and where its owner put it on
-- each map layout ({"landscape": {"x": 0.7, "y": 0.9}}, as fractions of the world).
create table private.addas (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references private.people (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 24),
  style      text not null check (style in ('shamiana', 'tambu', 'chhatri')),
  color      text not null check (color in ('rani', 'marigold', 'peacock', 'leaf', 'violet', 'chai')),
  places     jsonb not null default '{}' check (jsonb_typeof(places) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index addas_owner on private.addas (owner_id);

-- Who is in (or invited to) which adda. A declined invite stays as 'declined' so the owner keeps
-- seeing "invited": a no is never signalled.
create table private.adda_members (
  adda_id     uuid not null references private.addas (id) on delete cascade,
  member_id   uuid not null references private.people (id) on delete cascade,
  status      text not null default 'invited' check (status in ('invited', 'joined', 'declined')),
  invited_at  timestamptz not null default now(),
  answered_at timestamptz,
  primary key (adda_id, member_id)
);

create index adda_members_member on private.adda_members (member_id);

alter table private.addas enable row level security;
alter table private.adda_members enable row level security;
revoke all on private.addas, private.adda_members from public, anon, authenticated;

-- ---- free waves skip the quota ----------------------------------------------------------------

create or replace function private.on_wave_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  target_user uuid;
  points integer;
begin
  update private.people
     set wave_points = wave_points + 1, points_at = now()
   where id = new.to_id
  returning user_id, wave_points into target_user, points;

  insert into private.daily_points (meet_day, person_id, points)
  values (new.meet_day, new.to_id, 1)
  on conflict (meet_day, person_id) do update set points = private.daily_points.points + 1;

  -- The sender's daily allowance. Never decremented (see private.wave_quota). Free waves
  -- (accepting an adda invite) don't count.
  if not new.free then
    insert into private.wave_quota (person_id, meet_day, sent)
    values (new.from_id, new.meet_day, 1)
    on conflict (person_id, meet_day) do update set sent = private.wave_quota.sent + 1;
  end if;

  -- Someone waved at you: a count only, never who.
  perform private.notify(target_user, 'wave_in', jsonb_build_object('points', points));
  return null;
end;
$$;

-- ---- unmatch and block end adda ties both ways ------------------------------------------------

-- Neither person stays in (or invited to) the other's addas.
create function private.cut_adda_ties(a uuid, b uuid) returns void
language sql security definer set search_path = ''
as $$
  delete from private.adda_members m
   using private.addas t
   where t.id = m.adda_id
     and ((t.owner_id = a and m.member_id = b) or (t.owner_id = b and m.member_id = a));
$$;

-- Unmatch and block both go through here: the chai, both waves, and now the adda ties.
create or replace function private.cut_ties(me uuid, person uuid) returns void
language sql security definer set search_path = ''
as $$
  delete from private.chais where a_id = least(me, person) and b_id = greatest(me, person);
  delete from private.waves
   where (from_id = me and to_id = person) or (from_id = person and to_id = me);
  select private.cut_adda_ties(me, person);
$$;

-- A block added any other way (an admin in the SQL editor) ends adda ties too.
create function private.on_block_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.cut_adda_ties(new.blocker_id, new.blocked_id);
  return null;
end;
$$;

create trigger blocks_after_insert after insert on private.blocks
  for each row execute function private.on_block_insert();

-- ---- helpers ----------------------------------------------------------------------------------

create function private.user_of(person uuid) returns uuid
language sql stable security definer set search_path = ''
as $$ select user_id from private.people where id = person $$;

-- Whether `other` is someone `me` can deal with: a visible bean, not me, no block either way.
create function private.reachable(me private.people, other uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select me.status = 'visible'
     and other <> me.id
     and exists (select 1 from private.people where id = other and status = 'visible')
     and not private.blocked_between(me.id, other)
$$;

-- Same lock as wave(): one transaction at a time per pair, so a wave and an invite answer
-- never race into two chais.
create function private.lock_pair(a uuid, b uuid) returns void
language sql security definer set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended(
    'pair:' || least(a::text, b::text) || ':' || greatest(a::text, b::text), 0))
$$;

-- ---- your addas --------------------------------------------------------------------------------

-- A tidy adda name, or an exception: same cleaning and blocklist as bean names, ≤ 24 characters.
create function private.adda_name(raw text) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  cleaned text := private.clean_name(raw);
begin
  if cleaned is null or char_length(cleaned) not between 1 and 24 then
    raise exception 'coii:invalid_name';
  end if;
  if private.name_has_link(cleaned) or private.has_mention(cleaned) then
    raise exception 'coii:name_link_not_allowed';
  end if;
  if exists (select 1 from private.blocked_terms where position(term in lower(cleaned)) > 0) then
    raise exception 'coii:name_blocked';
  end if;
  return cleaned;
end;
$$;

create function private.check_look(style text, color text) returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if style is null or style not in ('shamiana', 'tambu', 'chhatri') then
    raise exception 'coii:invalid_style';
  end if;
  if color is null or color not in ('rani', 'marigold', 'peacock', 'leaf', 'violet', 'chai') then
    raise exception 'coii:invalid_color';
  end if;
end;
$$;

-- Your adda with this id, or an exception (someone else's or gone).
create function private.my_adda(me uuid, adda uuid) returns private.addas
language plpgsql stable security definer set search_path = ''
as $$
declare
  mine private.addas;
begin
  select * into mine from private.addas where id = adda and owner_id = me;
  if mine.id is null then
    raise exception 'coii:no_adda';
  end if;
  return mine;
end;
$$;

-- Builds a new adda (up to three per person) and returns its id.
create function public.create_adda(name text, style text, color text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
  created uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('adda:' || me.id::text, 0));
  perform private.check_look(style, color);
  if (select count(*) from private.addas where owner_id = me.id) >= 3 then
    raise exception 'coii:too_many_addas';
  end if;
  insert into private.addas (owner_id, name, style, color)
  values (me.id, private.adda_name(name), style, color)
  returning id into created;
  return created;
end;
$$;

-- Renames an adda and changes how its tent looks.
create function public.update_adda(adda uuid, name text, style text, color text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
begin
  perform private.my_adda(me.id, adda);
  perform private.check_look(style, color);
  update private.addas
     set name = private.adda_name(update_adda.name), style = update_adda.style,
         color = update_adda.color,
         updated_at = now()
   where id = adda;
end;
$$;

-- Takes the tent down; its people are let go silently.
create function public.delete_adda(adda uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
begin
  delete from private.addas where id = adda and owner_id = me.id;
end;
$$;

-- Remembers where you put the tent on one map layout, as fractions of the world (0–1).
create function public.move_adda(adda uuid, mode text, x real, y real) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
begin
  perform private.my_adda(me.id, adda);
  if mode is null or mode not in ('landscape', 'portrait')
     or x is null or y is null or x not between 0 and 1 or y not between 0 and 1 then
    raise exception 'coii:invalid_place';
  end if;
  update private.addas
     set places = places || jsonb_build_object(mode, jsonb_build_object('x', x, 'y', y)),
         updated_at = now()
   where id = adda;
end;
$$;

-- Invites someone you have waved at to one of your addas. Returns 'invited', 'already',
-- 'needs_adda', 'needs_wave', 'full' or 'unavailable'. The invite tells them who it's from.
create function public.invite_to_adda(adda uuid, person uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
begin
  -- One invite at a time per adda, so the 30-person cap holds under concurrent taps.
  perform pg_advisory_xact_lock(hashtextextended('adda:' || adda::text, 0));
  if not exists (select 1 from private.addas where id = adda and owner_id = me.id) then
    return 'needs_adda';
  end if;
  if not private.reachable(me, person) then
    return 'unavailable';
  end if;
  if exists (select 1 from private.adda_members where adda_id = adda and member_id = person) then
    return 'already';
  end if;
  if not exists (select 1 from private.waves where from_id = me.id and to_id = person) then
    return 'needs_wave';
  end if;
  if (select count(*) from private.adda_members where adda_id = adda) >= 30 then
    return 'full';
  end if;
  insert into private.adda_members (adda_id, member_id) values (adda, person);
  perform private.notify(private.user_of(person), 'adda_invite',
                         jsonb_build_object('adda_id', adda, 'owner_id', me.id));
  return 'invited';
end;
$$;

-- Takes back an invite or removes a member. Silent.
create function public.remove_from_adda(adda uuid, person uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
begin
  delete from private.adda_members m
   using private.addas a
   where a.id = m.adda_id and a.id = adda and a.owner_id = me.id and m.member_id = person;
end;
$$;

-- ---- other people's addas -----------------------------------------------------------------------

-- Free wave back on joining: the owner gets a point, and since they waved first it's a chai.
create function private.join_wave(me uuid, owner uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.waves (from_id, to_id, meet_day, free)
  values (me, owner, private.current_meet_day(), true)
  on conflict do nothing;
  if exists (select 1 from private.waves where from_id = owner and to_id = me) then
    insert into private.chais (a_id, b_id) values (least(me, owner), greatest(me, owner))
    on conflict do nothing;
  end if;
end;
$$;

-- Answers an invite: 'joined' (a free wave back, so a chai), 'declined' (never shown to the
-- owner) or 'unavailable' when there is no open invite.
create function public.respond_to_adda_invite(adda uuid, accept boolean) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
  owner uuid := (select owner_id from private.addas where id = adda);
begin
  if owner is null then
    return 'unavailable';
  end if;
  perform private.lock_pair(me.id, owner);
  if not exists (select 1 from private.adda_members
                 where adda_id = adda and member_id = me.id and status = 'invited') then
    return 'unavailable';
  end if;
  if not coalesce(accept, false) then
    update private.adda_members set status = 'declined', answered_at = now()
     where adda_id = adda and member_id = me.id;
    return 'declined';
  end if;
  if not private.reachable(me, owner) then
    return 'unavailable';
  end if;
  update private.adda_members set status = 'joined', answered_at = now()
   where adda_id = adda and member_id = me.id;
  perform private.join_wave(me.id, owner);
  perform private.notify(private.user_of(owner), 'adda_joined',
                         jsonb_build_object('adda_id', adda, 'person_id', me.id));
  return 'joined';
end;
$$;

-- Leaves an adda you joined (or drops an invite). Silent.
create function public.leave_adda(adda uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
begin
  delete from private.adda_members where adda_id = adda and member_id = me.id;
end;
$$;

-- ---- state --------------------------------------------------------------------------------------

-- Visible members of an adda, for its owner: a declined invite reads as 'invited'.
create function private.adda_members_json(adda uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.member_id,
           'status', case m.status when 'joined' then 'joined' else 'invited' end,
           'invited_at', m.invited_at) order by m.invited_at), '[]'::jsonb)
    from private.adda_members m
    join private.people p on p.id = m.member_id and p.status = 'visible'
   where m.adda_id = adda
$$;

-- Your addas, invites waiting for you and the addas you're in. Only visible people are listed.
create function public.get_adda_state() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
begin
  return jsonb_build_object(
    'addas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'name', a.name, 'style', a.style, 'color', a.color,
               'places', a.places, 'members', private.adda_members_json(a.id))
             order by a.created_at)
        from private.addas a where a.owner_id = me.id), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
               'adda_id', a.id, 'owner_id', a.owner_id, 'name', a.name, 'at', m.invited_at)
             order by m.invited_at)
        from private.adda_members m
        join private.addas a on a.id = m.adda_id
       where m.member_id = me.id and m.status = 'invited'
         and private.reachable(me, a.owner_id)), '[]'::jsonb),
    'joined', coalesce((
      select jsonb_agg(jsonb_build_object(
               'adda_id', a.id, 'owner_id', a.owner_id, 'name', a.name,
               'style', a.style, 'color', a.color,
               'member_ids', coalesce((
                 select jsonb_agg(o.member_id order by o.answered_at)
                   from private.adda_members o
                   join private.people op on op.id = o.member_id and op.status = 'visible'
                  where o.adda_id = a.id and o.status = 'joined' and o.member_id <> me.id),
                 '[]'::jsonb)))
        from private.adda_members m
        join private.addas a on a.id = m.adda_id
       where m.member_id = me.id and m.status = 'joined'
         and private.reachable(me, a.owner_id)), '[]'::jsonb)
  );
end;
$$;

-- ---- after the event ----------------------------------------------------------------------------

-- Same as before, plus addas: who planned to meet whom goes with the waves and chais.
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
  if exists (select 1 from cron.job where jobname = 'post-event-purge') then
    perform cron.unschedule('post-event-purge');
  end if;
end;
$$;

-- ---- privileges ---------------------------------------------------------------------------------

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
grant execute on function public.link_telegram(uuid, bigint, text) to service_role;
