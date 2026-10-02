-- coii backend, part 2: derived data and personal realtime events.
-- Spec: docs/prd/database.md §7 (triggers) and §11 (realtime).

-- Sends a personal event to one signed-in person's private topic `user:<auth uid>`. Demo beans
-- have no user, so seeding sends nothing.
create function private.notify(user_id uuid, event text, payload jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if user_id is not null then
    perform realtime.send(payload, event, 'user:' || user_id::text, true);
  end if;
end;
$$;

-- ---- waves → points ---------------------------------------------------------------------------

create function private.on_wave_insert() returns trigger
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

  -- The sender's daily allowance. Never decremented (see private.wave_quota).
  insert into private.wave_quota (person_id, meet_day, sent)
  values (new.from_id, new.meet_day, 1)
  on conflict (person_id, meet_day) do update set sent = private.wave_quota.sent + 1;

  -- Someone waved at you: a count only, never who.
  perform private.notify(target_user, 'wave_in', jsonb_build_object('points', points));
  return null;
end;
$$;

-- Also fires for cascaded deletes. When the target bean itself is being deleted its row is
-- already gone, so the updates simply match nothing.
create function private.on_wave_delete() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update private.people
     set wave_points = wave_points - 1, points_at = now()
   where id = old.to_id;

  update private.daily_points
     set points = points - 1
   where meet_day = old.meet_day and person_id = old.to_id;
  return null;
end;
$$;

create trigger waves_after_insert after insert on private.waves
  for each row execute function private.on_wave_insert();
create trigger waves_after_delete after delete on private.waves
  for each row execute function private.on_wave_delete();

-- ---- chais → "Chai's on!" for the other side ----------------------------------------------------

-- The waver learns about the chai from the wave() result; the other side gets an event.
create function private.on_chai_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  a_user uuid;
  b_user uuid;
begin
  select user_id into a_user from private.people where id = new.a_id;
  select user_id into b_user from private.people where id = new.b_id;
  if a_user is distinct from caller then
    perform private.notify(a_user, 'chai', jsonb_build_object('person_id', new.b_id));
  end if;
  if b_user is distinct from caller then
    perform private.notify(b_user, 'chai', jsonb_build_object('person_id', new.a_id));
  end if;
  return null;
end;
$$;

create trigger chais_after_insert after insert on private.chais
  for each row execute function private.on_chai_insert();

-- ---- reports → auto-hide ------------------------------------------------------------------------

-- Whether a report counts towards auto-hide: not yet reviewed (an admin un-hiding with
-- private.unhide marks reports reviewed), and filed by a bean that was at least 24 hours old
-- when it reported. Reports from newer accounts are stored and reviewed by hand, but never
-- count, even after the account gets older (no instant report brigades from fresh accounts).
create function private.report_counts(report private.reports) returns boolean
language sql stable security definer set search_path = ''
as $$
  select report.reviewed_at is null
     and exists (select 1 from private.people r
                 where r.id = report.reporter_id
                   and r.joined_at <= report.created_at - interval '24 hours')
$$;

-- Three counting reports hide the bean.
create function private.on_report_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update private.people
     set status = 'hidden', hidden_reason = 'reports'
   where id = new.person_id
     and status = 'visible'
     and (select count(*) from private.reports r
          where r.person_id = new.person_id and private.report_counts(r)) >= 3;
  return null;
end;
$$;

create trigger reports_after_insert after insert on private.reports
  for each row execute function private.on_report_insert();

-- ---- people → deltas and tombstones -------------------------------------------------------------

-- Any change to what the map shows bumps profile_at, which drives get_venue_changes().
create function private.on_people_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (new.name, new.topics, new.intents, new.one_liners, new.skin, new.hair, new.hair_color,
      new.accessory, new.telegram_verified, new.ticket_verified, new.status)
     is distinct from
     (old.name, old.topics, old.intents, old.one_liners, old.skin, old.hair, old.hair_color,
      old.accessory, old.telegram_verified, old.ticket_verified, old.status) then
    new.profile_at := now();
  end if;
  return new;
end;
$$;

create function private.on_people_status() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'visible' and new.status = 'hidden' then
    insert into private.venue_tombstones (person_id, removed_at) values (new.id, now())
    on conflict (person_id) do update set removed_at = excluded.removed_at;
  elsif old.status = 'hidden' and new.status = 'visible' then
    delete from private.venue_tombstones where person_id = new.id;
  end if;
  return null;
end;
$$;

create function private.on_people_delete() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.venue_tombstones (person_id, removed_at) values (old.id, now())
  on conflict (person_id) do update set removed_at = excluded.removed_at;
  return null;
end;
$$;

create trigger people_before_update before update on private.people
  for each row execute function private.on_people_update();
create trigger people_after_status after update of status on private.people
  for each row execute function private.on_people_status();
create trigger people_after_delete after delete on private.people
  for each row execute function private.on_people_delete();

-- ---- repairs ------------------------------------------------------------------------------------

-- Rebuilds wave_points and today's daily_points from waves (admin only; see the runbook).
create function private.recount_points() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  today date := private.current_meet_day();
begin
  update private.people p
     set wave_points = coalesce(w.n, 0), points_at = now()
    from (select id, (select count(*) from private.waves where to_id = id)::integer as n
            from private.people) w
   where p.id = w.id and p.wave_points <> coalesce(w.n, 0);

  delete from private.daily_points where meet_day = today;
  insert into private.daily_points (meet_day, person_id, points)
  select today, to_id, count(*)::integer from private.waves where meet_day = today group by to_id;
end;
$$;

-- ---- realtime: personal topics only -------------------------------------------------------------

-- Signed-in people may listen on their own topic and nothing else. No insert policy, so clients
-- can't send anything.
create policy "read own personal topic" on realtime.messages
  for select to authenticated
  using ((select realtime.topic()) = 'user:' || (select auth.uid())::text);

revoke all on all functions in schema private from public, anon, authenticated;
