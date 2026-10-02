-- Demo purge, post-event cleanup and scheduled jobs (§14, §16; acceptance criterion 11).
begin;
\ir _helpers.inc
select plan(15);

-- ---- scheduled jobs -----------------------------------------------------------------------------
select is(
  (select array_agg(jobname::text order by jobname) from cron.job),
  array['orphan-anon-users', 'post-event-purge', 'prune-tombstones'],
  'the three jobs are scheduled'
);
select is((select schedule from cron.job where jobname = 'post-event-purge'), '0 0 6 12 *',
  'the post-event purge runs on 6 Dec (UTC)');

-- ---- purge_demo: demo beans go, real ones stay (AC 11) ------------------------------------------
create temp table cast_ as
select tests.join('Asha Rao', '{privacy}', 'asha_builds', null) as asha,
       tests.join('Ravi Kumar', '{privacy}', 'ravi_builds', null) as ravi,
       tests.demo('Demo Dev', '{privacy}') as demo;

select tests.wave((select asha from cast_), (select ravi from cast_));
select tests.wave((select asha from cast_), (select demo from cast_));
-- A demo bean waves at Asha (the seed does the same through the table).
insert into private.waves (from_id, to_id, meet_day)
values ((select demo from cast_), (select asha from cast_), private.current_meet_day());

select ok((select count(*) from private.people where source = 'demo') > 1,
  'demo beans exist before the purge (seed and test)');
select ok(private.purge_demo() > 1, 'purge_demo reports how many it removed');
select is((select count(*)::int from private.people where source = 'demo'), 0, 'no demo beans remain');
select is((select count(*)::int from private.people
           where id in ((select asha from cast_), (select ravi from cast_))), 2,
  'real beans are untouched');
select is((select wave_points from private.people where id = (select asha from cast_)), 0,
  'the point a demo bean gave a real person is gone');
select is((select wave_points from private.people where id = (select ravi from cast_)), 1,
  'points between real people stay');
select ok(not exists (select 1 from private.waves w
                      left join private.people p on p.id in (w.from_id, w.to_id)
                      where p.source = 'demo'),
  'no wave touches a demo bean');
select ok(exists (select 1 from private.venue_tombstones where person_id = (select demo from cast_)),
  'open maps are told to remove demo beans');
select ok(tests.points_consistent(), 'counters still match a full recount');

-- ---- orphaned anonymous sessions and old tombstones -----------------------------------------------
create temp table users_ as select tests.new_user() as stale, tests.new_user() as fresh;
update auth.users set created_at = now() - interval '25 hours' where id = (select stale from users_);
update auth.users set created_at = now() - interval '25 hours'
 where id = tests.user_of((select asha from cast_));
select private.delete_orphan_anon_users();
select is((select count(*)::int from auth.users
           where id in ((select stale from users_), (select fresh from users_),
                        tests.user_of((select asha from cast_)))), 2,
  'only stale anonymous users without a bean are deleted');

insert into private.venue_tombstones (person_id, removed_at)
values (gen_random_uuid(), now() - interval '31 days');
select ok(private.prune_tombstones() >= 1, 'tombstones older than 30 days are pruned');

-- ---- after the event ----------------------------------------------------------------------------
select private.post_event_purge();
select is((select count(*)::int from private.waves) + (select count(*)::int from private.chais)
          + (select count(*)::int from private.daily_hands) + (select count(*)::int from private.skips)
          + (select count(*)::int from private.wave_quota),
  0, 'the post-event purge forgets waves, chais, hands, skips and daily allowances');
select ok(not exists (select 1 from cron.job where jobname = 'post-event-purge'),
  'and unschedules itself');

select * from finish();
rollback;
