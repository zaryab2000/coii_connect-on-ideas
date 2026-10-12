-- NPC beans (docs-internal/prd/npc-beans.md): 30 grey background walkers that survive the demo
-- purge, carry flag bit 16 on the venue, and are inert everywhere else.
begin;
\ir _helpers.inc
select plan(21);

create temp table npc_ as select id from private.people where source = 'npc';

-- ---- the 30 ------------------------------------------------------------------------------------
select is((select count(*)::int from npc_), 30, 'exactly 30 NPCs');
select ok((select bool_and(id::text like 'e0000000-0000-4000-8000-%') from npc_),
  'with the fixed NPC ids');
insert into private.people (id, source, name, topics, skin, hair, hair_color, accessory)
select id, 'npc', 'Again', '{ai}', 0, 0, 0, 0 from npc_ on conflict (id) do nothing;
select is((select count(*)::int from private.people where source = 'npc'), 30,
  'inserting them again changes nothing');
select is((select count(*)::int from private.contacts where person_id in (select id from npc_)), 0,
  'NPCs have no handles');
select ok((select bool_and(user_id is null and consent_at is null and wave_points = 0)
           from private.people where source = 'npc'), 'no login, no consent, no points');
select ok((select count(distinct t)::int from private.people, unnest(topics) t
           where source = 'npc') = 10, 'between them, every booth topic appears');

-- ---- constraints ---------------------------------------------------------------------------------
select throws_ok($$insert into private.people (source, name, topics, skin, hair, hair_color, accessory, user_id)
                   values ('npc', 'Logged In', '{ai}', 0, 0, 0, 0, gen_random_uuid())$$,
  '23514', null, 'an NPC can never have a login');
select throws_ok($$insert into private.people (source, name, topics, skin, hair, hair_color, accessory)
                   values ('robot', 'Nope', '{ai}', 0, 0, 0, 0)$$,
  '23514', null, 'only self, demo, invited and npc are sources');

-- ---- the venue -------------------------------------------------------------------------------------
create temp table venue_ as select public.get_venue()::jsonb as v;
select is((select count(*)::int from venue_, jsonb_array_elements_text(v -> 'id') with ordinality as i(id, n)
           where ((v -> 'f' ->> (n - 1)::int)::int & 16) = 16), 30,
  'the venue marks exactly the 30 NPCs with flag bit 16');
select is((select count(*)::int from venue_, jsonb_array_elements_text(v -> 'id') with ordinality as i(id, n)
           where ((v -> 'f' ->> (n - 1)::int)::int & 16) = 16
             and ((v -> 'p' ->> (n - 1)::int)::int <> 0 or (v -> 'd' ->> (n - 1)::int)::int <> 0)), 0,
  'with no points');

-- ---- inert ---------------------------------------------------------------------------------------
create temp table cast_ as select tests.join('Asha Rao', '{ai}', 'asha_builds', null) as asha;
select tests.act((select asha from cast_));
create temp table first_npc as select id from npc_ order by id limit 1;
select is(public.wave((select id from first_npc)) ->> 'result', 'unavailable', 'waving at an NPC is refused');
select is((select count(*)::int from private.waves where to_id = (select id from first_npc)), 0,
  'and leaves no wave');
select is(private.waves_used_today((select asha from cast_)), 0, 'and uses no daily wave');
select is(public.get_contacts(array(select id from npc_)), '[]'::jsonb, 'NPCs have no contacts to unlock');
select public.report((select id from first_npc), 'spam');
select public.block((select id from first_npc));
select is((select count(*)::int from private.reports r join npc_ n on n.id = r.person_id)
          + (select count(*)::int from private.blocks b join npc_ n on n.id = b.blocked_id), 0,
  'report and block quietly do nothing');
select ok(not private.reachable((select p from private.people p where p.id = (select asha from cast_)),
                                (select id from first_npc)), 'NPCs are never reachable for adda');
select is((select count(*)::int
           from jsonb_array_elements(public.hand_inputs(tests.user_of((select asha from cast_))) -> 'candidates') c
           where (c ->> 'id')::uuid in (select id from npc_)), 0,
  'NPCs are never in Today''s 3 candidates');

-- ---- purges --------------------------------------------------------------------------------------
select private.purge_demo();
select is((select count(*)::int from private.people where source = 'demo')
          || '/' || (select count(*)::int from private.people where source = 'npc'), '0/30',
  'purge_demo() removes every demo bean and leaves exactly the 30 NPCs');
select private.post_event_purge();
select is((select count(*)::int from private.people where source = 'npc'), 30,
  'post_event_purge() leaves them too');
select ok(not has_function_privilege('authenticated', 'private.remove_npcs()', 'execute')
          and not has_function_privilege('anon', 'private.remove_npcs()', 'execute'),
  'remove_npcs() is not callable by API roles');
select is(private.remove_npcs(), 30, 'remove_npcs() deletes them');

select * from finish();
rollback;
