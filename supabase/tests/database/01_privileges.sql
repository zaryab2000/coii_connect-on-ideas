-- Invariants 1 and 2 (docs/prd/database.md §12): no direct table access for browser roles, and
-- exactly the intended functions are callable by each role.
begin;
\ir _helpers.inc
select plan(10);

select is(
  (select count(*)::int from pg_tables where schemaname = 'private' and not rowsecurity),
  0,
  'RLS is on for every private table'
);

select is(
  (select count(*)::int from pg_policies where schemaname = 'private'),
  0,
  'private tables have no policies (nothing can pass RLS)'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage')
  and not has_schema_privilege('authenticated', 'private', 'usage'),
  'browser roles cannot even look inside the private schema'
);

select is(
  (select count(*)::int
     from pg_tables t, unnest(array['anon', 'authenticated']) as r(role),
          unnest(array['select', 'insert', 'update', 'delete']) as p(priv)
    where t.schemaname = 'private'
      and has_table_privilege(r.role, format('private.%I', t.tablename), p.priv)),
  0,
  'anon and authenticated have no table privileges in private'
);

select ok(
  not exists (select 1 from pg_tables where schemaname = 'public'),
  'public holds no tables (the Data API exposes functions only)'
);

-- Exactly who can call what in public.
create function tests.callable(role text) returns text[]
language sql as $$
  select coalesce(array_agg(p.proname::text order by p.proname), '{}')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege(role, p.oid, 'execute')
$$;

select is(
  tests.callable('anon'),
  array['claim_preview', 'get_venue', 'get_venue_changes'],
  'anon can call exactly the venue functions and the claim-link preview'
);

select is(
  tests.callable('authenticated'),
  array['block', 'claim_bean', 'claim_preview', 'create_adda', 'delete_adda', 'dismiss_chai', 'get_adda_state', 'get_contacts',
        'get_me', 'get_meet_state', 'get_venue', 'get_venue_changes', 'invite_to_adda',
        'leave_adda', 'move_adda', 'remove_from_adda', 'report', 'respond_to_adda_invite',
        'reveal_card', 'set_chai_status', 'skip', 'submit_feature_request', 'unmatch',
        'update_adda', 'upsert_profile', 'wave'],
  'authenticated can call exactly the §8.1 list plus the adda, claim and feature-request functions'
);

select is(
  tests.callable('service_role'),
  array['hand_inputs', 'link_telegram', 'save_hand'],
  'service_role can call exactly the three internal functions'
);

select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
          unnest(array['anon', 'authenticated', 'service_role']) as r(role)
    where n.nspname = 'private' and has_function_privilege(r.role, p.oid, 'execute')),
  0,
  'no API role can call anything in private (invite_bean and the other admin tools included)'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and not p.prosecdef),
  0,
  'every public function is security definer'
);

select * from finish();
rollback;
