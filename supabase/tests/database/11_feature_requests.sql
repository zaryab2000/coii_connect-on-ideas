-- Feature requests (docs-internal/prd/feature-requests.md §5): the table's rules, who can send,
-- cleaning and the 10–300 range, links allowed, 3 per Meet day (resetting the next day), leaving
-- coii keeps the idea but not who sent it, and the purges leave requests alone.
begin;
\ir _helpers.inc
select plan(24);

create temp table cast_ as
select tests.join('Asha Rao', '{privacy}', 'asha_builds', null) as asha,
       tests.join('Ravi Kumar', '{core}', 'ravi_builds', null) as ravi;

-- ---- the table ----------------------------------------------------------------------------------
select throws_ok($$insert into private.feature_requests (kind, body) values ('wish', 'a long enough idea')$$,
  '23514', null, 'only the four kinds');
select throws_ok($$insert into private.feature_requests (kind, body) values ('feature', 'too short')$$,
  '23514', null, 'a body is at least 10 characters');
select throws_ok(format($$insert into private.feature_requests (kind, body) values ('feature', %L)$$,
                        repeat('x', 301)),
  '23514', null, 'and at most 300');
select throws_ok($$insert into private.feature_requests (kind, body, status) values ('feature', 'a long enough idea', 'maybe')$$,
  '23514', null, 'only the four statuses');

-- ---- who can send -------------------------------------------------------------------------------
select tests.claim(null);
select throws_ok($$select public.submit_feature_request('feature', 'A booth for ZK hardware')$$,
  'coii:not_signed_in', 'nobody signed in: not_signed_in');
select tests.claim(tests.new_user());
select throws_ok($$select public.submit_feature_request('feature', 'A booth for ZK hardware')$$,
  'coii:no_profile', 'signed in without a bean: no_profile');

select tests.act((select asha from cast_));
create temp table sent_ as
select public.submit_feature_request('booth', '  A booth   for' || chr(8203) || ' ZK hardware  ') as id;
select is((select person_id || '/' || kind || '/' || status from private.feature_requests
            where id = (select id from sent_)),
  (select asha from cast_)::text || '/booth/new', 'a joined person''s idea is stored with their bean');
select is((select body from private.feature_requests where id = (select id from sent_)),
  'A booth for ZK hardware', 'cleaned: invisible characters stripped and whitespace collapsed');

-- ---- what can be sent ---------------------------------------------------------------------------
select throws_ok($$select public.submit_feature_request('feature', 'too short')$$,
  'coii:invalid_request', 'fewer than 10 characters');
select throws_ok($$select public.submit_feature_request('feature', '   tiny' || chr(8203) || chr(8203) || '    ')$$,
  'coii:invalid_request', 'counted after cleaning');
select throws_ok(format($$select public.submit_feature_request('feature', %L)$$, repeat('x', 301)),
  'coii:invalid_request', 'more than 300 characters');
select throws_ok($$select public.submit_feature_request('wish', 'A booth for ZK hardware')$$,
  'coii:invalid_request', 'an unknown kind');
select throws_ok($$select public.submit_feature_request(null, 'A booth for ZK hardware')$$,
  'coii:invalid_request', 'no kind');
select ok(public.submit_feature_request('other', 'See https://github.com/x/y and ask @zaryab') is not null,
  'links and @mentions are allowed (only the owner reads these)');

-- ---- 3 per Meet day -----------------------------------------------------------------------------
select ok(public.submit_feature_request('design', 'Let me add a cape to my bean') is not null,
  'a third idea today is fine');
select throws_ok($$select public.submit_feature_request('feature', 'One more idea for today')$$,
  'coii:too_many_requests', 'a fourth one today is refused');
select tests.act((select ravi from cast_));
select ok(public.submit_feature_request('feature', 'Ravi''s own first idea') is not null,
  'the limit is per bean');
-- A day later (the rows moved back past the 06:00 IST reset), Asha can send again.
update private.feature_requests set created_at = created_at - interval '1 day'
 where person_id = (select asha from cast_);
select tests.act((select asha from cast_));
select ok(public.submit_feature_request('feature', 'A new day, a new idea') is not null,
  'the limit resets the next Meet day');

-- ---- hidden beans -------------------------------------------------------------------------------
update private.people set status = 'hidden', hidden_reason = 'reports' where id = (select ravi from cast_);
select tests.act((select ravi from cast_));
select throws_ok($$select public.submit_feature_request('feature', 'A sneaky idea from hiding')$$,
  'coii:no_profile', 'a hidden (moderated) bean can''t send');

-- ---- nobody reads them through the API ----------------------------------------------------------
select ok(not has_table_privilege('authenticated', 'private.feature_requests', 'select')
          and not has_table_privilege('anon', 'private.feature_requests', 'select'),
  'browser roles can''t read the table');
select is((select pg_get_function_result(p.oid) from pg_proc p
            where p.proname = 'submit_feature_request'),
  'uuid', 'sending returns only the new id');

-- ---- purges and leaving -------------------------------------------------------------------------
create temp table before_ as select count(*)::int as n from private.feature_requests;
select private.purge_demo();
select private.post_event_purge();
select is((select count(*)::int from private.feature_requests), (select n from before_),
  'purge_demo and post_event_purge leave requests alone');

-- Leaving coii deletes the account, which deletes the bean.
delete from auth.users where id = tests.user_of((select asha from cast_));
select is((select count(*)::int from private.feature_requests where person_id is null), 4,
  'leaving keeps the ideas');
select ok(not exists (select 1 from private.feature_requests
                      where person_id = (select asha from cast_)),
  'but not who sent them');

select * from finish();
rollback;
