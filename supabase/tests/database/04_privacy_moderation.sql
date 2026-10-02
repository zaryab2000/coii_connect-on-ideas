-- What never leaks, moderation, venue deltas and account deletion (invariants 3, 5, 9, 10).
begin;
\ir _helpers.inc
select plan(38);

create temp table cast_ as
select tests.join('Asha Rao', '{privacy}', 'asha_builds', 'asha_x') as asha,
       tests.join('Ravi Kumar', '{privacy,core}', 'ravi_builds', null) as ravi,
       tests.join('Mei Lin', '{defi}', 'mei_builds', null) as mei,
       tests.join('Omar Ali', '{defi}', 'omar_builds', null) as omar,
       tests.join('Leo Park', '{ai}', 'leo_builds', null) as leo;

select tests.wave((select asha from cast_), (select ravi from cast_));

-- ---- nothing private in public outputs (invariant 3) ----------------------------------------------
create temp table outputs as
select public.get_venue()::text as venue,
       public.get_venue_changes(now() - interval '1 hour')::text as changes;

select ok((select venue not like '%builds%' and venue not like '%asha_x%' from outputs),
  'the venue snapshot carries no handles');
select ok((select changes not like '%builds%' from outputs), 'venue deltas carry no handles');
select ok((select bool_and(o.venue not like '%' || u.id || '%' and o.changes not like '%' || u.id || '%')
           from outputs o, auth.users u),
  'no auth user id appears in venue data');
select is((with v as (select public.get_venue()::jsonb as j)
           select (v.j -> 'p' ->> (e.ord - 1)::int)::int
           from v, jsonb_array_elements_text(v.j -> 'id') with ordinality as e(id, ord)
           where e.id = (select ravi from cast_)::text), 1,
  'the snapshot carries public points');

select tests.act((select ravi from cast_));
select is((public.get_meet_state() ->> 'inbound')::int, 1, 'Ravi sees one inbound wave…');
select ok(public.get_meet_state()::text not like '%' || (select asha from cast_) || '%',
  '…but nothing in his state says it was Asha');
select ok(public.get_me()::text like '%ravi_builds%', 'your own profile includes your handles');

-- ---- personal realtime events ---------------------------------------------------------------------
select is((select count(*)::int from realtime.messages
           where topic = 'user:' || tests.user_of((select ravi from cast_)) and event = 'wave_in'), 1,
  'the target gets a wave_in event on their private topic');
select is((select payload - 'id' from realtime.messages
           where topic = 'user:' || tests.user_of((select ravi from cast_)) and event = 'wave_in'),
  '{"points": 1}'::jsonb, 'wave_in holds a count, not who');

select set_config('realtime.topic', 'user:' || tests.user_of((select ravi from cast_)), true);
select tests.act((select mei from cast_));
set local role authenticated;
select is((select count(*)::int from realtime.messages), 0,
  'nobody can read someone else''s personal topic');
reset role;
select tests.act((select ravi from cast_));
set local role authenticated;
select ok((select count(*)::int from realtime.messages) >= 1, 'you can read your own topic');
reset role;

-- ---- you only ever change your own things (invariant 5) -------------------------------------------
select tests.wave((select ravi from cast_), (select asha from cast_));
select tests.act((select ravi from cast_));
select public.set_chai_status((select asha from cast_), 'messaged');
select public.dismiss_chai((select asha from cast_));
select ok((select (case when a_id = (select ravi from cast_) then a_status = 'messaged' and b_status = 'new' and a_seen and not b_seen
                        else b_status = 'messaged' and a_status = 'new' and b_seen and not a_seen end)
           from private.chais where (select ravi from cast_) in (a_id, b_id)),
  'chai status and seen change only on your own side');
select is(public.set_chai_status((select asha from cast_), 'new'), '{"bonus_awarded": false}'::jsonb,
  'chai status only moves forward');
select throws_ok($$select public.set_chai_status((select mei from cast_), 'met')$$, 'coii:no_chai',
  'no chai, no status');
select throws_ok($$select public.set_chai_status((select asha from cast_), 'dating')$$, 'coii:invalid_status',
  'unknown statuses are refused');

-- ---- reports from accounts under a day old are kept but never count (owner decision 3) -------------
create temp table fresh as
  select tests.join('Fresh ' || n, '{ai}') as id from generate_series(1, 3) as n;
do $$
declare f record;
begin
  for f in select id from fresh loop
    perform tests.act(f.id);
    perform public.report((select mei from cast_), 'spam');
  end loop;
end $$;
select is((select count(*)::int from private.reports where person_id = (select mei from cast_)), 3,
  'reports from brand-new accounts are stored for review');
select is((select status from private.people where id = (select mei from cast_)), 'visible',
  'but three of them don''t hide anyone');
-- What matters is the account's age when it reported, which never changes afterwards.
update private.people set joined_at = now() - interval '23 hours'
 where id = (select id from fresh limit 1);
update private.people set joined_at = now() - interval '25 hours'
 where id = (select id from fresh offset 1 limit 1);
select is((select array_agg(private.report_counts(r) order by p.joined_at desc)
           from private.reports r join private.people p on p.id = r.reporter_id
           where r.person_id = (select mei from cast_)
             and r.reporter_id in (select id from fresh limit 2)),
  array[false, true], 'a reporter 23 h old at report time doesn''t count; 25 h old does');

-- ---- reports hide on the third distinct, established reporter ---------------------------------------
update private.people set joined_at = now() - interval '2 days'
 where id in ((select asha from cast_), (select ravi from cast_), (select mei from cast_),
              (select leo from cast_));
select tests.wave((select asha from cast_), (select omar from cast_));
select tests.act((select asha from cast_));
select public.report((select omar from cast_), 'spam');
select public.report((select omar from cast_), 'scam');
select tests.act((select ravi from cast_));
select public.report((select omar from cast_), 'spam');
select is((select status from private.people where id = (select omar from cast_)), 'visible',
  'two reporters don''t hide anyone (a repeat report doesn''t count twice)');
select throws_ok($$select public.report((select omar from cast_), 'meh')$$, 'coii:invalid_reason',
  'report reasons come from a fixed list');

create temp table before_hide as select now() - interval '1 second' as at;
select tests.act((select mei from cast_));
select public.report((select omar from cast_), 'inappropriate');
select is((select status || '/' || hidden_reason from private.people where id = (select omar from cast_)),
  'hidden/reports', 'the third distinct reporter hides the bean, and the reason is recorded');
select tests.act((select asha from cast_));
select is(public.get_contacts(array[(select omar from cast_)]), '[]'::jsonb,
  'a hidden bean''s handles stay locked, even for people who waved earlier');

-- ---- hidden people disappear everywhere (invariant 9) ---------------------------------------------
select ok(public.get_venue()::text not like '%' || (select omar from cast_) || '%',
  'hidden people are not in the snapshot');
select ok((public.get_venue_changes((select at from before_hide)) -> 'removed')::jsonb
          ? (select omar from cast_)::text,
  'open maps learn to remove them through the delta');
select is(tests.wave((select omar from cast_), (select mei from cast_)), 'unavailable',
  'hidden people can''t wave');
select is(tests.wave((select mei from cast_), (select omar from cast_)), 'unavailable',
  'and can''t be waved at');

select private.unhide((select omar from cast_));
select ok(not exists (select 1 from private.venue_tombstones where person_id = (select omar from cast_)),
  'unhiding removes the tombstone');
select ok((public.get_venue_changes((select at from before_hide)) -> 'people' -> 'id')::jsonb
          ? (select omar from cast_)::text,
  'and they come back through the delta');

select tests.act((select leo from cast_));
select public.report((select omar from cast_), 'spam');
select is((select status from private.people where id = (select omar from cast_)), 'visible',
  'after review, one new report doesn''t hide them again (old reports are marked reviewed)');

select private.hide((select leo from cast_));
select tests.act((select leo from cast_));
select public.report((select mei from cast_), 'spam');
select ok(not exists (select 1 from private.reports
                      where reporter_id = (select leo from cast_) and person_id = (select mei from cast_)),
  'hidden people can''t report anyone');

-- ---- deltas ---------------------------------------------------------------------------------------
-- now() is frozen inside a test transaction, so age everyone's rows to before the cursor.
update private.people set profile_at = now() - interval '1 minute', points_at = now() - interval '1 minute';
create temp table cursor_ as select now() - interval '30 seconds' as at;
select tests.wave((select mei from cast_), (select asha from cast_));
select ok((public.get_venue_changes((select at from cursor_)) -> 'points' -> 'id')::jsonb
          ? (select asha from cast_)::text
       and not (public.get_venue_changes((select at from cursor_)) -> 'people' -> 'id')::jsonb
          ? (select asha from cast_)::text,
  'a new point shows up in the points delta, not as a profile change');
select is(public.get_venue_changes(now() - interval '31 days')::jsonb, '{"v":1,"full":true}'::jsonb,
  'a cursor older than 30 days asks for a full reload');
select is(public.get_venue_changes(now() + interval '1 hour')::jsonb, '{"v":1,"full":true}'::jsonb,
  'a cursor from the future asks for a full reload');

-- ---- deleting an account removes everything (invariant 10) ----------------------------------------
create temp table gone as select (select asha from cast_) as id, tests.user_of((select asha from cast_)) as uid;
select is((select wave_points from private.people where id = (select ravi from cast_)), 1,
  'Ravi has Asha''s point before she leaves');
delete from auth.users where id = (select uid from gone);
select is((select (
    (select count(*) from private.people where id = g.id)
  + (select count(*) from private.contacts where person_id = g.id)
  + (select count(*) from private.waves where g.id in (from_id, to_id))
  + (select count(*) from private.chais where g.id in (a_id, b_id))
  + (select count(*) from private.daily_points where person_id = g.id)
  + (select count(*) from private.reports where g.id in (person_id, reporter_id))
  + (select count(*) from private.blocks where g.id in (blocker_id, blocked_id))
  + (select count(*) from private.skips where g.id in (person_id, skipped_id))
  + (select count(*) from private.daily_hands where person_id = g.id))::int from gone g), 0,
  'every row that referenced her is gone');
select is((select wave_points from private.people where id = (select ravi from cast_)), 0,
  'her wave no longer counts for Ravi');
select ok(exists (select 1 from private.venue_tombstones where person_id = (select id from gone)),
  'a tombstone tells open maps to remove her');
select ok(tests.points_consistent(), 'counters still match a full recount');

select * from finish();
rollback;
