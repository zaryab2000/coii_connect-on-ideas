-- Hands, skips, bonus cards and Telegram verification (§8.1, §8.6, §9.1, §9.2).
begin;
\ir _helpers.inc
select plan(29);

create temp table cast_ as
select tests.join('Asha Rao', '{privacy}', 'asha_builds', null) as asha,
       tests.join('Ravi Kumar', '{privacy,core}', 'ravi_builds', null) as ravi,
       tests.join('Mei Lin', '{defi}', 'mei_builds', 'mei_x') as mei,
       tests.demo('Demo Dev', '{privacy}') as demo;

-- ---- hands (service role builds them, the owner reads and reveals) --------------------------------
select tests.act((select asha from cast_));
select ok((public.get_meet_state() ->> 'deal_needed')::boolean, 'no hand yet: a deal is needed');
select is(public.get_meet_state() -> 'hand' -> 'cards', '[]'::jsonb, 'and the hand is empty');

select tests.wave((select ravi from cast_), (select asha from cast_));
select is((public.hand_inputs(tests.user_of((select asha from cast_))) -> 'waved_at_viewer'),
  jsonb_build_array((select ravi from cast_)),
  'hand_inputs tells the dealer who waved at the viewer (never returned to the viewer)');
select ok(not (public.hand_inputs(tests.user_of((select asha from cast_))) -> 'candidates')::text
          like '%asha_builds%', 'hand_inputs carries no handles');

select tests.wave((select asha from cast_), (select mei from cast_));
select ok((public.hand_inputs(tests.user_of((select asha from cast_))) -> 'excluded')
          ? (select mei from cast_)::text, 'people you waved at are excluded from hands');

create temp table hand_ as select jsonb_build_array(
  jsonb_build_object('personId', (select ravi from cast_), 'wildcard', false, 'reasons', '["You both: Privacy"]'::jsonb),
  jsonb_build_object('personId', (select demo from cast_), 'wildcard', true, 'reasons', '["Wildcard"]'::jsonb)
) as cards;
select is(jsonb_array_length(public.save_hand(tests.user_of((select asha from cast_)),
                                              private.current_meet_day(), (select cards from hand_), 0::smallint) -> 'cards'),
  2, 'save_hand stores the dealt cards');
select is(jsonb_array_length(public.save_hand(tests.user_of((select asha from cast_)),
                                              private.current_meet_day(),
                                              jsonb_build_array((select cards -> 0 from hand_)), 0::smallint) -> 'cards'),
  2, 'a racing shorter deal never replaces a longer hand');

select tests.act((select asha from cast_));
select ok(not (public.get_meet_state() ->> 'deal_needed')::boolean, 'with a fresh hand, no deal is needed');
select is(public.hand_inputs(tests.user_of((select asha from cast_))) - 'hand',
  '{"ready": true}'::jsonb, 'repeat deal requests return early without the expensive inputs');

-- A short hand (few people had joined) is dealt again after 30 minutes.
update private.daily_hands set dealt_at = now() - interval '31 minutes'
 where person_id = (select asha from cast_);
select ok((public.get_meet_state() ->> 'deal_needed')::boolean, 'a short hand is re-dealt after 30 minutes');
update private.daily_hands set dealt_at = now() where person_id = (select asha from cast_);
select public.reveal_card((select ravi from cast_));
select public.reveal_card((select ravi from cast_));
select is(public.get_meet_state() -> 'hand' -> 'revealed', jsonb_build_array((select ravi from cast_)),
  'revealing is idempotent');
select throws_ok($$select public.reveal_card((select mei from cast_))$$, 'coii:not_in_hand',
  'you can only reveal cards in today''s hand');

-- A card whose person blocks you disappears from your hand.
select tests.act((select ravi from cast_));
select public.block((select asha from cast_));
select tests.act((select asha from cast_));
select is(jsonb_array_length(public.get_meet_state() -> 'hand' -> 'cards'), 1,
  'a card disappears when that person blocks you');
select is((public.get_meet_state() ->> 'inbound')::int, 0, 'and so does their wave');

-- ---- skips --------------------------------------------------------------------------------------
select public.skip((select demo from cast_));
select is(public.get_meet_state() -> 'skipped', jsonb_build_array((select demo from cast_)),
  'skipped people are listed for a week');
update private.daily_hands set dealt_at = now() - interval '31 minutes'
 where person_id = (select asha from cast_);
select ok((public.hand_inputs(tests.user_of((select asha from cast_))) -> 'excluded')
          ? (select demo from cast_)::text, 'and excluded from hands');
update private.daily_hands set dealt_at = now() where person_id = (select asha from cast_);

-- ---- meeting in person earns a bonus card -------------------------------------------------------
select tests.wave((select mei from cast_), (select asha from cast_));
select tests.act((select asha from cast_));
select is(public.set_chai_status((select mei from cast_), 'met'), '{"bonus_awarded": true}'::jsonb,
  'confirming you met earns a bonus card');
select ok((public.get_meet_state() ->> 'deal_needed')::boolean, 'which asks for a top-up deal');
select is((public.get_meet_state() -> 'hand' ->> 'bonus')::int, 1, 'bonus is 1');
select is(public.set_chai_status((select mei from cast_), 'met'), '{"bonus_awarded": false}'::jsonb,
  'confirming twice earns nothing more');

-- "We met" landing between hand_inputs and save_hand: the cards were dealt for bonus 0.
select public.save_hand(tests.user_of((select asha from cast_)), private.current_meet_day(),
                        (select cards from hand_), 0::smallint);
select tests.act((select asha from cast_));
select ok((public.get_meet_state() ->> 'deal_needed')::boolean,
  'a hand dealt before the bonus stays due for a top-up');
select public.save_hand(tests.user_of((select asha from cast_)), private.current_meet_day(),
                        (select cards from hand_), 1::smallint);
select ok(not (public.get_meet_state() ->> 'deal_needed')::boolean,
  'dealing for the new bonus settles it');

-- ---- Telegram verification ----------------------------------------------------------------------
-- Mei pretends to be @asha_real; the real Asha verifies that username with Telegram.
select tests.act((select mei from cast_));
select public.upsert_profile('Mei Lin', '{defi}', '{}', '{}', '{0,0,0,0}', 'asha_real', 'mei_x', false);
select is(public.link_telegram(tests.user_of((select asha from cast_)), 4242, 'asha_real') ->> 'telegram',
  'asha_real', 'verifying sets the Telegram username');
select ok((select telegram_verified from private.people where id = (select asha from cast_)),
  'and the ✓ badge');
select ok((select telegram is null and x = 'mei_x' from private.contacts where person_id = (select mei from cast_)),
  'the impersonator loses the username but keeps their X handle');

select tests.act((select ravi from cast_));
select public.upsert_profile('Ravi Kumar', '{privacy,core}', '{}', '{}', '{0,0,0,0}', 'ravi_real', null, false);
select tests.act((select asha from cast_));
select is((select status from private.people where id = (select ravi from cast_)), 'visible', 'Ravi is visible');
select public.link_telegram(tests.user_of((select asha from cast_)), 4242, 'ravi_real');
select is((select status || '/' || hidden_reason from private.people where id = (select ravi from cast_)),
  'hidden/impersonation', 'a bean whose only handle was someone else''s verified username is hidden');
select throws_ok($$select private.unhide((select ravi from cast_))$$, 'coii:no_handle',
  'it can''t be un-hidden until it has a handle again');
select throws_ok($$select public.link_telegram(tests.user_of((select mei from cast_)), 4242, 'mei_tg_name')$$,
  'coii:telegram_taken', 'one Telegram account verifies one bean');

select * from finish();
rollback;
