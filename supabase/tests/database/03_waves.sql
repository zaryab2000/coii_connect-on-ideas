-- Waves, points, chais and the daily quota (invariants 4, 6, 7, 8; §8.4; Meet-day boundary).
begin;
\ir _helpers.inc
select plan(36);

-- ---- the Meet day ---------------------------------------------------------------------------------
select is(private.meet_day('2026-11-03 00:29:59+00'), '2026-11-02'::date,
  '00:29:59 UTC (05:59:59 IST) still belongs to the previous Meet day');
select is(private.meet_day('2026-11-03 00:30:00+00'), '2026-11-03'::date,
  '00:30 UTC (06:00 IST) starts the new Meet day');
select is(private.meet_day('2026-11-03 18:00:00+00'), '2026-11-03'::date,
  'late evening UTC (just before midnight IST) is the same Meet day');

-- ---- one wave ------------------------------------------------------------------------------------
create temp table cast_ as
select tests.join('Asha Rao', '{privacy}', 'asha_builds', 'asha_x') as asha,
       tests.join('Ravi Kumar', '{privacy,core}', 'ravi_builds', null) as ravi,
       tests.join('Mei Lin', '{defi}', 'mei_builds', null) as mei;

select tests.act((select asha from cast_));
select is((public.wave((select ravi from cast_)) - 'waves_left'),
  '{"result":"waved","contacts":{"x":null,"telegram":"ravi_builds"}}'::jsonb,
  'waving returns the target''s handles');
select is((select wave_points from private.people where id = (select ravi from cast_)), 1,
  'the target gets one wave point');
select is((select points from private.daily_points
           where person_id = (select ravi from cast_) and meet_day = private.current_meet_day()), 1,
  'and one point on today''s board');

select is(tests.wave((select asha from cast_), (select ravi from cast_)), 'already',
  'waving twice is "already"');
select is((select wave_points from private.people where id = (select ravi from cast_)), 1,
  'a repeated wave never adds a point');
select is(public.wave((select ravi from cast_)) -> 'contacts' ->> 'telegram', 'ravi_builds',
  '"already" still returns the handles');
select is(tests.wave((select asha from cast_), (select asha from cast_)), 'unavailable',
  'you can''t wave at yourself');
select is(tests.wave((select asha from cast_), gen_random_uuid()), 'unavailable',
  'waving at nobody is "unavailable"');

-- ---- contacts unlock only through a wave ----------------------------------------------------------
select tests.act((select asha from cast_));
select is(public.get_contacts(array[(select ravi from cast_), (select mei from cast_)]),
  jsonb_build_array(jsonb_build_object('id', (select ravi from cast_), 'telegram', 'ravi_builds', 'x', null)),
  'get_contacts returns handles only for people you waved at');
select is(tests.wave((select mei from cast_), (select ravi from cast_)), 'waved', 'Mei waves at Ravi');
select tests.act((select mei from cast_));
select is(public.get_contacts(array[(select asha from cast_)]), '[]'::jsonb,
  'Mei can''t read Asha''s handles without waving');
select lives_ok($$select public.get_contacts(array(select gen_random_uuid() from generate_series(1, 200)))$$,
  '200 ids are allowed');
select throws_ok($$select public.get_contacts(array(select gen_random_uuid() from generate_series(1, 201)))$$,
  'coii:too_many', '201 ids are too many');

-- ---- mutual waves make exactly one chai -----------------------------------------------------------
select is(tests.wave((select ravi from cast_), (select asha from cast_)), 'chai',
  'waving back makes it mutual');
select is((select count(*)::int from private.chais
           where a_id = least((select asha from cast_), (select ravi from cast_))
             and b_id = greatest((select asha from cast_), (select ravi from cast_))), 1,
  'exactly one chai row');
select is(tests.wave((select ravi from cast_), (select asha from cast_)), 'already',
  'waving again after a chai is "already"');
select is((select count(*)::int from private.chais
           where (select asha from cast_) in (a_id, b_id)), 1, 'still exactly one chai');

-- ---- the 50-a-day quota ---------------------------------------------------------------------------
create temp table crowd as
  select tests.demo('Demo ' || n, '{ai}') as id, n from generate_series(1, 51) as n;
select tests.act((select mei from cast_));
select is((select count(*)::int from crowd c where n <= 49 and public.wave(c.id) ->> 'result' = 'waved'), 49,
  '49 more waves go through (50 with the one to Ravi)');
select is(public.wave((select id from crowd where n = 50)) ->> 'result', 'quota',
  'the 51st wave of the Meet day is refused');
select is(public.get_meet_state() ->> 'waves_left', '0', 'no waves left today');


-- ---- unmatch and block remove both waves ----------------------------------------------------------
select tests.act((select asha from cast_));
select public.unmatch((select ravi from cast_));
select is((select wave_points from private.people where id = (select asha from cast_)), 0,
  'unmatch takes Ravi''s point away from Asha');
select is((select wave_points from private.people where id = (select ravi from cast_)), 1,
  'and Asha''s point away from Ravi (Mei''s stays)');
select is((select count(*)::int from private.chais
           where (select asha from cast_) in (a_id, b_id)), 0, 'and the chai');
select throws_ok($$select public.unmatch((select ravi from cast_))$$, 'coii:no_chai',
  'unmatch needs a chai');

select tests.act((select mei from cast_));
select public.block((select ravi from cast_));
select is((select count(*)::int from private.waves
           where from_id = (select mei from cast_) and to_id = (select ravi from cast_)), 0,
  'block removes the wave');
select is((select wave_points from private.people where id = (select ravi from cast_)), 0,
  'and the point it gave');
select is(tests.wave((select ravi from cast_), (select mei from cast_)), 'unavailable',
  'a blocked person can''t wave back');

-- ---- unmatch and block never give back the daily allowance (review #1) ---------------------------
create temp table leo_ as select tests.join('Leo Park', '{ai}', 'leo_builds', null) as id;
select tests.act((select id from leo_));
select is((select count(*)::int from crowd c where n <= 50 and public.wave(c.id) ->> 'result' = 'waved'), 50,
  'Leo spends all 50 waves');
select public.block((select id from crowd where n = 1));
select is(public.wave((select id from crowd where n = 51)) ->> 'result', 'quota',
  'blocking someone doesn''t refund the wave: no handle harvesting by wave-block-wave');
select is((public.get_meet_state() ->> 'waves_left')::int, 0, 'still no waves left');

-- ---- counters always match a recount (invariant 8) ------------------------------------------------
select ok(tests.points_consistent(), 'wave_points and daily_points match a full recount');

-- ---- the quota resets with the Meet day ------------------------------------------------------------
-- Pretend Mei's allowance was used yesterday.
update private.wave_quota set meet_day = private.current_meet_day() - 1
 where person_id = (select mei from cast_);
select tests.act((select mei from cast_));
select is(public.wave((select id from crowd where n = 50)) ->> 'result', 'waved',
  'yesterday''s waves don''t count against today');
select is((public.get_meet_state() ->> 'waves_left')::int, 49, 'one wave used on the new day');

select * from finish();
rollback;
