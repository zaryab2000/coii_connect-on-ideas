-- Adda: up to three per person, names and places, inviting after a wave, answering, the
-- 30-person cap, privacy of a "no", free waves on joining, leaving, deleting and blocking
-- (docs/prd/iteration_v2_feature.md).
begin;
\ir _helpers.inc
select plan(44);

create temp table cast_ as
select tests.join('Asha Rao', '{privacy}', 'asha_builds', null) as asha,
       tests.join('Ravi Kumar', '{privacy,core}', 'ravi_builds', null) as ravi,
       tests.join('Mei Lin', '{defi}', 'mei_builds', null) as mei;
create temp table addas_ (name text primary key, id uuid);

-- ---- building -----------------------------------------------------------------------------------
select tests.act((select asha from cast_));
select throws_ok($$select public.create_adda('ZK crew', 'igloo', 'rani')$$, 'coii:invalid_style',
  'only the three tent styles');
select throws_ok($$select public.create_adda('ZK crew', 'tambu', 'black')$$, 'coii:invalid_color',
  'only the six colours');
select throws_ok($$select public.create_adda('see t.me/zk', 'tambu', 'leaf')$$,
  'coii:name_link_not_allowed', 'no links in a name');
select throws_ok($$select public.create_adda('   ', 'tambu', 'leaf')$$, 'coii:invalid_name',
  'a name is needed');
insert into addas_ values ('zk', public.create_adda('  ZK   crew ', 'tambu', 'leaf'));
insert into addas_ values ('founders', public.create_adda('Founders', 'chhatri', 'rani'));
insert into addas_ values ('third', public.create_adda('Third', 'shamiana', 'chai'));
select is((select name from private.addas where id = (select id from addas_ where name = 'zk')),
  'ZK crew', 'names are cleaned like bean names');
select throws_ok($$select public.create_adda('Fourth', 'tambu', 'leaf')$$, 'coii:too_many_addas',
  'three addas at most');
select is(jsonb_array_length(public.get_adda_state() -> 'addas'), 3, 'the state lists all three');

select lives_ok(format($$select public.update_adda(%L, 'ZK people', 'chhatri', 'violet')$$,
  (select id from addas_ where name = 'zk')), 'renaming and restyling works');
select lives_ok(format($$select public.move_adda(%L, 'portrait', 0.2, 0.9)$$,
  (select id from addas_ where name = 'zk')), 'and moving the tent');
select is((select places from private.addas where id = (select id from addas_ where name = 'zk')),
  '{"portrait": {"x": 0.2, "y": 0.9}}'::jsonb, 'the place is kept per layout');
select throws_ok(format($$select public.move_adda(%L, 'portrait', 1.5, 0.9)$$,
  (select id from addas_ where name = 'zk')), 'coii:invalid_place', 'places stay inside the map');

select tests.act((select ravi from cast_));
select throws_ok(format($$select public.update_adda(%L, 'Mine now', 'tambu', 'leaf')$$,
  (select id from addas_ where name = 'zk')), 'coii:no_adda', 'nobody else can change it');

-- ---- inviting -----------------------------------------------------------------------------------
select tests.act((select asha from cast_));
select is(public.invite_to_adda(gen_random_uuid(), (select ravi from cast_)), 'needs_adda',
  'inviting needs one of your addas');
select is(public.invite_to_adda((select id from addas_ where name = 'zk'), (select ravi from cast_)),
  'needs_wave', 'you have to wave before you invite');
select is(tests.wave((select asha from cast_), (select ravi from cast_)), 'waved', 'Asha waves at Ravi');
select tests.act((select asha from cast_));
select is(public.invite_to_adda((select id from addas_ where name = 'zk'), (select ravi from cast_)),
  'invited', 'then the invite goes out');
select is(public.invite_to_adda((select id from addas_ where name = 'zk'), (select ravi from cast_)),
  'already', 'inviting twice is "already"');
select is(public.invite_to_adda((select id from addas_ where name = 'founders'), (select ravi from cast_)),
  'invited', 'the same person can be invited to another of your addas');
select is(public.invite_to_adda((select id from addas_ where name = 'zk'), (select asha from cast_)),
  'unavailable', 'you can''t invite yourself');

select tests.act((select ravi from cast_));
select is(jsonb_array_length(public.get_adda_state() -> 'invites'), 2, 'Ravi sees both invites');
select is(public.get_adda_state() -> 'invites' -> 0 ->> 'name', 'ZK people',
  'with the adda''s name');

-- ---- a "no" is never signalled ------------------------------------------------------------------
select is(public.respond_to_adda_invite((select id from addas_ where name = 'zk'), false), 'declined',
  'Ravi says not now');
select is(jsonb_array_length(public.get_adda_state() -> 'invites'), 1, 'that invite leaves his list');
select is(public.respond_to_adda_invite((select id from addas_ where name = 'zk'), true), 'unavailable',
  'a declined invite can''t be answered again');
select tests.act((select asha from cast_));
select is((select a -> 'members' -> 0 ->> 'status'
             from jsonb_array_elements(public.get_adda_state() -> 'addas') a
            where a ->> 'name' = 'ZK people'), 'invited',
  'Asha still sees Ravi as invited: the no stays private');

-- ---- joining: a free wave back makes a chai -----------------------------------------------------
select is(tests.wave((select asha from cast_), (select mei from cast_)), 'waved', 'Asha waves at Mei');
select tests.act((select asha from cast_));
select is(public.invite_to_adda((select id from addas_ where name = 'zk'), (select mei from cast_)),
  'invited', 'and invites her');
select tests.act((select mei from cast_));
select is(public.respond_to_adda_invite((select id from addas_ where name = 'zk'), true), 'joined',
  'Mei joins');
select is((public.get_meet_state() ->> 'waves_left')::int, 50,
  'joining doesn''t use one of Mei''s 50 daily waves');
select is((select count(*)::int from private.chais
           where a_id = least((select asha from cast_), (select mei from cast_))
             and b_id = greatest((select asha from cast_), (select mei from cast_))), 1,
  'joining makes a chai with the owner');
select is((select wave_points from private.people where id = (select asha from cast_)), 1,
  'and gives the owner a wave point');
select is(public.get_adda_state() -> 'joined' -> 0 ->> 'name', 'ZK people',
  'Mei sees the adda she is in');

-- ---- leaving ------------------------------------------------------------------------------------
select public.leave_adda((select id from addas_ where name = 'zk'));
select is(public.get_adda_state() -> 'joined', '[]'::jsonb, 'Mei left the adda');

-- ---- the 30-person cap --------------------------------------------------------------------------
create temp table crowd as
  select tests.demo('Demo ' || n, '{privacy}') as id, n from generate_series(1, 30) as n;
select tests.act((select asha from cast_));
select is((select count(*)::int from crowd c where public.wave(c.id) ->> 'result' = 'waved'), 30,
  'Asha waves at 30 more people');
select is((select count(*)::int from crowd c
           where n <= 29
             and public.invite_to_adda((select id from addas_ where name = 'zk'), c.id) = 'invited'),
  29, '29 more invites fill the adda to 30 with Ravi');
select is(public.invite_to_adda((select id from addas_ where name = 'zk'), (select id from crowd where n = 30)),
  'full', 'the 31st person doesn''t fit');

-- ---- deleting and blocking ----------------------------------------------------------------------
select public.delete_adda((select id from addas_ where name = 'third'));
select is(jsonb_array_length(public.get_adda_state() -> 'addas'), 2, 'taking a tent down');

select tests.act((select ravi from cast_));
select public.block((select asha from cast_));
select is((select count(*)::int from private.adda_members where member_id = (select ravi from cast_)), 0,
  'blocking removes adda links both ways');

select tests.act((select asha from cast_));
select public.delete_adda((select id from addas_ where name = 'zk'));
select is((select count(*)::int from private.adda_members
           where adda_id = (select id from addas_ where name = 'zk')), 0,
  'deleting an adda lets its people go');

-- ---- unmatch ends adda ties both ways -----------------------------------------------------------
create temp table pair_ as
select tests.join('Kiran Shah', '{ai}', 'kiran_builds', null) as kiran,
       tests.join('Lea Roy', '{ai}', 'lea_builds', null) as lea;
create temp table pair_addas (owner text primary key, id uuid);
select tests.wave((select kiran from pair_), (select lea from pair_));
select tests.wave((select lea from pair_), (select kiran from pair_));
select tests.act((select kiran from pair_));
insert into pair_addas values ('kiran', public.create_adda('Kiran crew', 'tambu', 'leaf'));
select public.invite_to_adda((select id from pair_addas where owner = 'kiran'), (select lea from pair_));
select tests.act((select lea from pair_));
insert into pair_addas values ('lea', public.create_adda('Lea crew', 'tambu', 'rani'));
select public.invite_to_adda((select id from pair_addas where owner = 'lea'), (select kiran from pair_));
select public.respond_to_adda_invite((select id from pair_addas where owner = 'kiran'), true);
select is((select count(*)::int from private.adda_members
           where adda_id in (select id from pair_addas)), 2,
  'Lea is in Kiran''s adda and Kiran is invited to Lea''s');

select public.unmatch((select kiran from pair_));
select is((select count(*)::int from private.adda_members
           where adda_id in (select id from pair_addas)), 0,
  'unmatch removes the adda ties both ways');
select is(public.get_adda_state() -> 'joined', '[]'::jsonb,
  'Lea is no longer in Kiran''s adda');
select tests.act((select kiran from pair_));
select is((public.get_adda_state() -> 'invites'), '[]'::jsonb,
  'Kiran no longer has Lea''s invite');

select ok(tests.points_consistent(), 'wave_points and daily_points still match a full recount');

select * from finish();
rollback;
