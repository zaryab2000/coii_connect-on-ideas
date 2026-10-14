-- Telegram usernames only for people who verified their own Telegram (part 9): a wave unlocks X for
-- everyone, Telegram only for a verified waver. Shapes stay the same plus "telegram_locked".
begin;
\ir _helpers.inc
select plan(12);

create temp table cast_ as
select tests.join('Tara Unverified', '{privacy}', 'tara_tg', null) as tara,
       tests.join('Vik Verified', '{privacy}', 'vik_tg', null) as vik,
       tests.join('Both Handles', '{defi}', 'both_tg', 'both_x') as bea,
       tests.join('Only X', '{defi}', null, 'only_x_here') as only_x;
-- tests.join always sets a Telegram handle; Only X keeps just the X one.
update private.contacts set telegram = null where person_id = (select only_x from cast_);
update private.people set telegram_verified = true where id = (select vik from cast_);

-- ---- an unverified waver ---------------------------------------------------------------------------
select tests.act((select tara from cast_));
select is(public.wave((select bea from cast_)) -> 'contacts',
  '{"telegram":null,"x":"both_x","telegram_locked":true}'::jsonb,
  'an unverified waver gets the X handle, and Telegram is locked');
select is(public.wave((select only_x from cast_)) -> 'contacts',
  '{"telegram":null,"x":"only_x_here","telegram_locked":false}'::jsonb,
  'someone with no Telegram is not "locked"');
select is(public.wave((select bea from cast_)) -> 'contacts' ->> 'telegram', null,
  '"already" keeps Telegram locked too');
select is(public.get_contacts(array[(select bea from cast_)]),
  jsonb_build_array(jsonb_build_object('id', (select bea from cast_), 'telegram', null,
                                       'x', 'both_x', 'telegram_locked', true)),
  'get_contacts follows the same rule');
select is((select wave_points from private.people where id = (select bea from cast_)), 1,
  'the wave itself still counts: one point');

-- ---- a verified waver ------------------------------------------------------------------------------
select tests.act((select vik from cast_));
select is(public.wave((select bea from cast_)) -> 'contacts',
  '{"telegram":"both_tg","x":"both_x","telegram_locked":false}'::jsonb,
  'a verified waver gets the Telegram username');
select is(public.get_contacts(array[(select bea from cast_)]) -> 0 ->> 'telegram', 'both_tg',
  'and get_contacts returns it');

-- ---- verifying later unlocks what you already waved at ----------------------------------------------
update private.people set telegram_verified = true where id = (select tara from cast_);
select tests.act((select tara from cast_));
select is(public.get_contacts(array[(select bea from cast_)]) -> 0 ->> 'telegram', 'both_tg',
  'once Tara verifies, the people she waved at show their Telegram');

-- Changing your Telegram handle un-verifies you (upsert_profile), and locks Telegram again.
select public.upsert_profile('Tara Unverified', '{privacy}', '{}', '{}', '{1,2,3,0}', 'tara_new', null, true);
select is((select telegram_verified from private.people where id = (select tara from cast_)), false,
  'a new Telegram handle is no longer verified');
select is(public.get_contacts(array[(select bea from cast_)]) -> 0 ->> 'telegram_locked', 'true',
  'so Telegram is locked again');

-- ---- nothing else changed --------------------------------------------------------------------------
select tests.act((select bea from cast_));
select is(public.get_contacts(array[(select vik from cast_)]), '[]'::jsonb,
  'still nothing without a wave');
select ok(not has_function_privilege('authenticated', 'private.contacts_of(uuid)', 'execute'),
  'the helper stays private');

select * from finish();
rollback;
