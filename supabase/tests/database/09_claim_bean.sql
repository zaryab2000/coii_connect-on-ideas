-- Invited beans and claiming them (docs-internal/prd/claim-your-bean.md §6, §9): the new source
-- and consent rules, invite_bean / invite_beans, claim links stored as hashes, the preview that
-- never shows handles, claim_bean's checks, invited beans being inert, handle_invited, the
-- Telegram claim, the admin tools and both purges.
begin;
\ir _helpers.inc
select plan(67);

-- The invited bean's entry in the venue's flags column, or null when it isn't on the map.
create function tests.flag_of(person uuid) returns int
language sql as $$
  select ((s.v -> 'f') ->> (e.i - 1)::int)::int
  from (select public.get_venue()::jsonb as v) s,
       jsonb_array_elements_text(s.v -> 'id') with ordinality as e(id, i)
  where e.id = person::text
$$;

-- "<DETAIL>/<HINT>" of the error a statement raises, or null when it doesn't raise.
create function tests.error_detail(statement text) returns text
language plpgsql as $$
declare
  detail text;
  hint text;
begin
  execute statement;
  return null;
exception when others then
  get stacked diagnostics detail = pg_exception_detail, hint = pg_exception_hint;
  return detail || '/' || hint;
end;
$$;

-- An invite's token: the last part of its claim link.
create function tests.token_of(url text) returns text
language sql as $$ select substring(url from '/claim/(.+)$') $$;

create temp table cast_ as
select tests.join('Asha Rao', '{privacy}', 'asha_builds', null) as asha,
       tests.join('Ravi Kumar', '{privacy}', 'ravi_builds', null) as ravi;

create temp table inv_ as
select person_id as kiran, claim_url as kiran_url
  from private.invite_bean('  Kiran   Rao ', '{privacy,core}', '{building}',
                           '{"building private UPI rails"}', 'kiran_builds', 'kiran_x');

-- ---- the data model -----------------------------------------------------------------------------
select is((select source || '/' || coalesce(user_id::text, 'nobody') || '/' || coalesce(consent_at::text, 'no consent')
             from private.people where id = (select kiran from inv_)),
  'invited/nobody/no consent', 'an invited bean belongs to nobody and has no consent yet');
select is((select name from private.people where id = (select kiran from inv_)), 'Kiran Rao',
  'its name is cleaned like a joined name');

select throws_ok($$insert into private.people (source, name, topics, skin, hair, hair_color, accessory)
                   values ('self', 'No Owner', '{ai}', 0, 0, 0, 0)$$, '23514', null,
  'a self bean needs an auth user');
select throws_ok($$insert into private.people (user_id, source, name, topics, skin, hair, hair_color, accessory, consent_at)
                   values (tests.new_user(), 'invited', 'Owned', '{ai}', 0, 0, 0, 0, now())$$, '23514', null,
  'an invited bean can''t have an auth user');
select throws_ok($$insert into private.people (user_id, source, name, topics, skin, hair, hair_color, accessory)
                   values (tests.new_user(), 'self', 'No Consent', '{ai}', 0, 0, 0, 0)$$, '23514', null,
  'a self bean needs consent');
select throws_ok($$insert into private.people (source, name, topics, skin, hair, hair_color, accessory)
                   values ('other', 'Odd', '{ai}', 0, 0, 0, 0)$$, '23514', null,
  'only self, demo and invited are sources');

-- ---- claim links ----------------------------------------------------------------------------------
select ok((select kiran_url from inv_) ~ '^https://coii\.decipherclub\.com/claim/[A-Za-z0-9_-]{43}$',
  'invite_bean returns a claim link with a 32-byte base64url token, no padding');
select is((select token_hash from private.claim_tokens where person_id = (select kiran from inv_)),
  sha256(convert_to(tests.token_of((select kiran_url from inv_)), 'UTF8')),
  'only the sha256 of the token is stored');
select is((select count(*)::int from information_schema.columns
            where table_schema = 'private' and table_name = 'claim_tokens'
              and data_type in ('text', 'character varying')),
  0, 'the claim table has no column that could hold the token itself');
select is((select expires_at from private.claim_tokens where person_id = (select kiran from inv_)),
  '2026-11-07 00:00:00+05:30'::timestamptz, 'a new link works until the day after Devcon 8');

-- ---- invite_bean validates like joining ------------------------------------------------------------
select throws_ok($$select private.invite_bean('Nobody', '{ai}', '{}', '{}', null, '  ')$$,
  'coii:handle_required', 'an invited bean needs a handle');
select throws_ok($$select private.invite_bean('Topicless', '{}', '{}', '{}', 'topicless_tg', null)$$,
  'coii:invalid_topics', 'and 1 to 3 topics');
select throws_ok($$select private.invite_bean('Devcon Team', '{ai}', '{}', '{}', 'devcon_team', null)$$,
  'coii:name_blocked', 'names go through the blocklist');
select throws_ok($$select private.invite_bean('Linky', '{ai}', '{}', '{"see claimdrop.ai"}', 'linky_tg', null)$$,
  'coii:link_not_allowed', 'no links in one-liners');
select throws_ok($$select private.invite_bean('Mentiony', '{ai}', '{}', '{"ask @someone"}', 'mention_tg', null)$$,
  'coii:mention_not_allowed', 'no mentions in one-liners');
select throws_ok($$select private.invite_bean('Asha Copy', '{ai}', '{}', '{}', 'ASHA_BUILDS', null)$$,
  'coii:handle_taken', 'a joined person''s handle can''t be invited');
select throws_ok($$select private.invite_bean('Kiran Twin', '{ai}', '{}', '{}', null, 'Kiran_X')$$,
  'coii:handle_invited', 'nor an invited person''s');

create temp table looks_ as
select (select person_id from private.invite_bean('Meera Iyer', '{defi}', null, null, '@meera_tg', null,
                                                   '{1,2,3,0}')) as meera;
select is((select array[skin, hair, hair_color, accessory] from private.people
            where id = (select meera from looks_)), '{1,2,3,0}'::smallint[],
  'a given look is kept');
select is((select telegram from private.contacts where person_id = (select meera from looks_)),
  'meera_tg', 'a leading @ is dropped from a handle');

-- ---- invite_beans: all or nothing --------------------------------------------------------------------
select throws_ok($$select * from private.invite_beans('[
    {"name": "Batch One", "topics": ["ai"], "telegram": "batch_one"},
    {"name": "Batch Two", "topics": ["nope"], "telegram": "batch_two"}
  ]'::jsonb)$$,
  'coii:invalid_topics at row 2', 'a bad row names its row and its code');
select is((select count(*)::int from private.people where name like 'Batch %'), 0,
  'and nothing from the batch is inserted');
create temp table batch_ as
select * from private.invite_beans('[
    {"name": "Batch One", "topics": ["ai"], "intents": ["learning"], "telegram": "batch_one"},
    {"name": "Batch Two", "topics": ["defi", "core"], "one_liners": ["hello"], "x": "batch_two"}
  ]'::jsonb);
select is((select count(*)::int from batch_), 2, 'a good batch returns one claim link per row');
select is((select count(*)::int from private.people where name like 'Batch %' and source = 'invited'),
  2, 'and adds every row');

-- ---- what the public sees ------------------------------------------------------------------------------
select is(public.claim_preview(tests.token_of((select kiran_url from inv_))) - 'avatar',
  jsonb_build_object('person_id', (select kiran from inv_), 'name', 'Kiran Rao',
                     'topics', '["privacy", "core"]'::jsonb, 'intents', '["building"]'::jsonb,
                     'one_liners', '["building private UPI rails"]'::jsonb, 'status', 'ready'),
  'the preview shows the bean and that it is ready to claim');
select ok(public.claim_preview(tests.token_of((select kiran_url from inv_)))::text !~* 'kiran_builds|kiran_x',
  'the preview never shows handles');
select is(public.claim_preview('not-a-real-token'), '{"status": "invalid"}'::jsonb,
  'an unknown token is "invalid", with nothing else');
select is(tests.flag_of((select kiran from inv_)) & 8, 8, 'the venue marks an invited bean with bit 8');
select ok(public.get_venue()::text !~* 'kiran_builds|kiran_x', 'the venue never carries its handles');

-- ---- inert until claimed ---------------------------------------------------------------------------------
select is(tests.wave((select asha from cast_), (select kiran from inv_)), 'unclaimed',
  'waving at an invited bean is "unclaimed"');
select is((select count(*)::int from private.waves where to_id = (select kiran from inv_))
          + (select wave_points from private.people where id = (select kiran from inv_))
          + private.waves_used_today((select asha from cast_)),
  0, 'no wave row, no point and no allowance used');
select tests.act((select asha from cast_));
select is(public.get_contacts(array[(select kiran from inv_)]), '[]'::jsonb,
  'get_contacts never returns an invited bean');
select ok(not (public.hand_inputs(tests.user_of((select asha from cast_))) -> 'candidates')::text
          like '%' || (select kiran from inv_)::text || '%', 'invited beans are never dealt');
select ok(not private.reachable((select p from private.people p where id = (select asha from cast_)),
                                (select kiran from inv_)), 'nor reachable for an adda');
select public.report((select kiran from inv_), 'impersonation');
select ok(exists (select 1 from private.reports where person_id = (select kiran from inv_)),
  'but they can be reported');

-- ---- joining with an invited handle ------------------------------------------------------------------
select throws_ok($$select tests.join('Kiran Again', '{ai}', 'Kiran_Builds', null)$$,
  'coii:handle_invited', 'joining with an invited Telegram handle is "handle_invited"');
select is(tests.error_detail($$select tests.join('Kiran Again', '{ai}', 'kiran_builds', null)$$),
  (select kiran from inv_)::text || '/telegram', 'with the invited bean''s id and the handle');
select is(tests.error_detail($$select tests.join('Kiran X', '{ai}', 'some_other_tg', 'KIRAN_X')$$),
  (select kiran from inv_)::text || '/x', 'the same for an X handle');
select throws_ok($$select tests.join('Asha Copy', '{ai}', 'asha_builds', null)$$,
  'coii:handle_taken', 'a joined person''s handle is still "handle_taken"');

-- ---- claim_bean ------------------------------------------------------------------------------------------
create temp table claimer_ as select tests.new_user() as uid, tests.new_user() as late;
create temp table before_ as
select profile_at from private.people where id = (select kiran from inv_);

select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select public.claim_bean(tests.token_of((select kiran_url from inv_)), true)$$,
  'coii:not_signed_in', 'claiming needs a session');
select tests.act((select asha from cast_));
select throws_ok($$select public.claim_bean(tests.token_of((select kiran_url from inv_)), true)$$,
  'coii:already_joined', 'someone with a bean can''t claim another');
select tests.claim((select uid from claimer_));
select throws_ok($$select public.claim_bean(tests.token_of((select kiran_url from inv_)), false)$$,
  'coii:consent_required', 'claiming needs consent');
select throws_ok($$select public.claim_bean('not-a-real-token', true)$$,
  'coii:claim_invalid', 'an unknown token is "claim_invalid"');

create temp table lata_ as
select person_id as lata, claim_url as lata_url
  from private.invite_bean('Lata Shah', '{ai}', '{}', '{}', 'lata_shah', null);
update private.claim_tokens set expires_at = now() - interval '1 minute'
 where person_id = (select lata from lata_);
select throws_ok($$select public.claim_bean(tests.token_of((select lata_url from lata_)), true)$$,
  'coii:claim_expired', 'an expired link is "claim_expired"');
select is((public.claim_preview(tests.token_of((select lata_url from lata_)))) ->> 'status', 'expired',
  'and its preview says so');

select is(public.claim_bean(tests.token_of((select kiran_url from inv_)), true) ->> 'telegram',
  'kiran_builds', 'claiming returns your bean, handles included');
select is((select source || '/' || (user_id = (select uid from claimer_))::text || '/' || (consent_at is not null)::text
             from private.people where id = (select kiran from inv_)),
  'self/true/true', 'the bean is now the claimer''s own, with consent');
select ok((select used_at is not null from private.claim_tokens where person_id = (select kiran from inv_)),
  'the link is used up');
select ok((select profile_at from private.people where id = (select kiran from inv_))
          >= (select profile_at from before_), 'claiming bumps profile_at so open maps update');
select is(tests.flag_of((select kiran from inv_)) & 8, 0, 'the venue no longer marks it invited');
select is(public.claim_preview(tests.token_of((select kiran_url from inv_))) ->> 'status', 'claimed',
  'its preview now says "claimed"');
select tests.claim((select late from claimer_));
select throws_ok($$select public.claim_bean(tests.token_of((select kiran_url from inv_)), true)$$,
  'coii:claim_used', 'a used link can''t claim again');
select is(tests.wave((select asha from cast_), (select kiran from inv_)), 'waved',
  'once claimed, people can wave at it');

-- ---- Telegram ----------------------------------------------------------------------------------------------
create temp table tg_ as
select (select person_id from private.invite_bean('Nila Das', '{security}', '{}', '{}', 'nila_tg', null)) as nila,
       (select person_id from private.invite_bean('Om Prakash', '{security}', '{}', '{}', 'om_prakash', null)) as om,
       (select person_id from private.invite_bean('Pia Sen', '{security}', '{}', '{}', 'pia_tg', 'pia_x')) as pia,
       tests.new_user() as nila_user, tests.new_user() as stranger;

select throws_ok($$select public.link_telegram((select stranger from tg_), 501, 'om_prakash', false)$$,
  'coii:consent_required', 'a Telegram claim needs consent');
select throws_ok($$select public.link_telegram((select stranger from tg_), 501, 'nobody_here', true)$$,
  'coii:no_profile', 'without a bean or a matching invited bean there is nothing to verify');
select is(public.link_telegram((select nila_user from tg_), 777, 'NILA_TG', true) ->> 'name', 'Nila Das',
  'verifying the invited username claims the bean');
select is((select source || '/' || telegram_verified::text || '/' || (user_id = (select nila_user from tg_))::text
             from private.people where id = (select nila from tg_)),
  'self/true/true', 'claimed, verified and owned');
select ok((select used_at is not null from private.claim_tokens where person_id = (select nila from tg_)),
  'and its claim link stops working');

select public.link_telegram(tests.user_of((select ravi from cast_)), 888, 'pia_tg');
select ok(not exists (select 1 from private.people where id = (select pia from tg_)),
  'someone with a bean who verifies an invited username replaces that invited bean');
select is((select telegram || '/' || telegram_verified::text from private.contacts c
             join private.people p on p.id = c.person_id where p.id = (select ravi from cast_)),
  'pia_tg/true', 'and gets the verified username');

-- ---- admin tools ---------------------------------------------------------------------------------------------
create temp table quinn_ as
select person_id as quinn, claim_url as first_url
  from private.invite_bean('Quinn Roy', '{ai}', '{}', '{}', 'quinn_roy', null);
create temp table reissue_ as select private.reissue_claim((select quinn from quinn_)) as url;
select is(public.claim_preview(tests.token_of((select first_url from quinn_))) ->> 'status', 'invalid',
  'reissuing a link stops the old one');
select is(public.claim_preview(tests.token_of((select url from reissue_))) ->> 'status', 'ready',
  'and the new one works');
select throws_ok($$select private.reissue_claim((select asha from cast_))$$, 'coii:not_invited',
  'only invited beans get claim links');
select private.remove_invited((select om from tg_));
select ok(not exists (select 1 from private.people where id = (select om from tg_)),
  'remove_invited deletes an invited bean on request');
select throws_ok($$select private.remove_invited((select kiran from inv_))$$, 'coii:not_invited',
  'and refuses a claimed bean');

-- ---- purges ------------------------------------------------------------------------------------------------
create temp table invited_before as
select count(*)::int as n from private.people where source = 'invited';
select private.purge_demo();
select is((select count(*)::int from private.people where source = 'invited'),
  (select n from invited_before), 'purge_demo leaves invited beans alone');
select private.post_event_purge();
select ok(not exists (select 1 from private.people where source = 'invited')
          and not exists (select 1 from private.claim_tokens t
                          join private.people p on p.id = t.person_id where p.source = 'invited'),
  'the post-event purge deletes unclaimed invited beans and their links');
select ok(exists (select 1 from private.people where id = (select kiran from inv_)),
  'but keeps claimed ones');

select * from finish();
rollback;
