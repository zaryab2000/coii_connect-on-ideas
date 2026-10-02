-- coii backend, part 4: demo purge, post-event cleanup and scheduled jobs.
-- Spec: docs/prd/database.md §14 (dummy data) and §16 (operations). Runbook:
-- docs/runbooks/database.md.

-- Removes every demo bean (source = 'demo'). Cascades remove their handles, waves (so real
-- people's points from demo beans drop), chais and hands; tombstones tell open maps to remove
-- them. Run once on launch day: `select private.purge_demo();`. Returns how many were removed.
create function private.purge_demo() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  removed integer;
begin
  delete from private.people where source = 'demo';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- After the event (Meet PRD §10 retention): forget who waved at whom, chais, hands and skips.
-- Beans and handles stay until people leave. Unschedules its own job once it has run.
create function private.post_event_purge() returns void
language plpgsql security definer set search_path = ''
as $$
begin
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

-- Anonymous sessions that never saved a bean (an abandoned join form) after a day.
create function private.delete_orphan_anon_users() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  removed integer;
begin
  delete from auth.users u
   where u.is_anonymous
     and u.created_at < now() - interval '24 hours'
     and not exists (select 1 from private.people p where p.user_id = u.id);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create function private.prune_tombstones() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  removed integer;
begin
  delete from private.venue_tombstones where removed_at < now() - interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- ---- moderation (admin, from the SQL editor; see the runbook) -------------------------------------

-- Hides a bean by hand, e.g. after reviewing a complaint.
create function private.hide(person uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update private.people set status = 'hidden', hidden_reason = 'admin'
   where id = person and status = 'visible';
  if not found and not exists (select 1 from private.people where id = person) then
    raise exception 'coii:no_person';
  end if;
end;
$$;

-- Un-hides a bean and marks its reports as reviewed, so one new report can't hide it again.
-- A bean hidden for impersonation has no handle left; it must add one before it can come back.
create function private.unhide(person uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from private.people where id = person) then
    raise exception 'coii:no_person';
  end if;
  if not exists (select 1 from private.contacts where person_id = person) then
    raise exception 'coii:no_handle';
  end if;
  update private.reports set reviewed_at = now() where person_id = person and reviewed_at is null;
  update private.people set status = 'visible', hidden_reason = null
   where id = person and status = 'hidden';
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;

-- ---- scheduled jobs (pg_cron, UTC) --------------------------------------------------------------

create extension if not exists pg_cron;

select cron.schedule('orphan-anon-users', '0 22 * * *', 'select private.delete_orphan_anon_users()');
select cron.schedule('prune-tombstones', '10 22 * * *', 'select private.prune_tombstones()');
-- 6 Dec 2026 00:00 UTC (a month after the event); the job unschedules itself after running.
select cron.schedule('post-event-purge', '0 0 6 12 *', 'select private.post_event_purge()');
