-- Every validation rule and error code of upsert_profile (docs/prd/database.md §6.1, §8.5, §8.7).
begin;
\ir _helpers.inc
select plan(58);

-- Joins a fresh user with these fields (defaults are valid), returning the stored profile.
create function tests.try_join(
  name text default 'Zara Khan',
  topics text[] default '{ai}',
  intents text[] default '{}',
  lines text[] default '{}',
  avatar smallint[] default '{1,2,3,0}',
  telegram text default null,
  x text default 'zara_x',
  consent boolean default true
) returns jsonb
language plpgsql as $$
begin
  perform tests.claim(tests.new_user());
  return public.upsert_profile(name, topics, intents, lines, avatar, telegram, x, consent);
end;
$$;

-- Each case gets its own unique X handle so handle_taken doesn't mask the rule under test.
create function tests.fails(call text) returns text
language plpgsql as $$
begin
  execute call;
  return 'no error';
exception when others then
  return sqlerrm;
end;
$$;

-- ---- names --------------------------------------------------------------------------------------
select is(tests.fails($$select tests.try_join(name => '   ', x => 'a1')$$),
  'coii:invalid_name', 'a blank name is refused');
select is(tests.fails($$select tests.try_join(name => repeat('a', 41), x => 'a2')$$),
  'coii:invalid_name', 'a 41-character name is refused');
select is(tests.fails($$select tests.try_join(name => 'Devcon Support', x => 'a3')$$),
  'coii:name_blocked', 'names with a blocked term are refused');
select is(tests.fails($$select tests.try_join(name => 'the COII team', x => 'a4')$$),
  'coii:name_blocked', 'blocked terms match case-insensitively');
select is(tests.try_join(name => E'  Zara \n  Khan ', x => 'a5') ->> 'name', 'Zara Khan',
  'names are trimmed and whitespace is collapsed');
select is(tests.try_join(name => repeat('a', 40), x => 'a6') ->> 'name', repeat('a', 40),
  'a 40-character name is fine');
select is(tests.fails($$select tests.try_join(name => 'free ETH at mint-now.xyz', x => 'a7')$$),
  'coii:name_link_not_allowed', 'names can''t carry links (they show on map labels)');
select is(tests.fails($$select tests.try_join(name => 'dm t.me/zara', x => 'a10')$$),
  'coii:name_link_not_allowed', 'the short domains t.me…');
select is(tests.fails($$select tests.try_join(name => 'Zara x.com', x => 'a11')$$),
  'coii:name_link_not_allowed', '…x.com…');
select is(tests.fails($$select tests.try_join(name => 'win at t.co', x => 'a12')$$),
  'coii:name_link_not_allowed', '…and t.co are refused by name');
select is((select array_agg(tests.try_join(name => n, x => 'i' || ord) ->> 'name' order by ord)
           from unnest(array['K.Ravi Kumar', 'S.Priya', 'A.R.Rahman', 'Dr.Anita Rao']) with ordinality as u(n, ord)),
  array['K.Ravi Kumar', 'S.Priya', 'A.R.Rahman', 'Dr.Anita Rao'],
  'names written with initials are fine (common in South India)');
select is(tests.fails($$select tests.try_join(name => U&'\3164\2800\3164', x => 'a13')$$),
  'coii:invalid_name', 'a name made only of blank-rendering characters (Hangul filler, Braille blank) is empty');
select is(tests.fails($$select tests.try_join(name => 'Dev' || U&'\200B' || 'con Team', x => 'a8')$$),
  'coii:name_blocked', 'a zero-width space can''t sneak a blocked term past the blocklist');
select is(tests.try_join(name => U&'Zara\00A0\200D Khan\FEFF', x => 'a9') ->> 'name', 'Zara Khan',
  'invisible characters are stripped and Unicode spaces collapse like normal ones');

-- ---- topics and intents ---------------------------------------------------------------------------
select is(tests.fails($$select tests.try_join(topics => '{}', x => 'b1')$$),
  'coii:invalid_topics', 'at least one topic');
select is(tests.fails($$select tests.try_join(topics => '{ai,defi,core,jobs}', x => 'b2')$$),
  'coii:invalid_topics', 'at most three topics');
select is(tests.fails($$select tests.try_join(topics => '{ai,ai}', x => 'b3')$$),
  'coii:invalid_topics', 'no repeated topics');
select is(tests.fails($$select tests.try_join(topics => '{gaming}', x => 'b4')$$),
  'coii:invalid_topics', 'only known topics');
select is(tests.fails($$select tests.try_join(intents => '{building,hiring,raising}', x => 'b5')$$),
  'coii:invalid_intents', 'at most two intents');
select is(tests.fails($$select tests.try_join(intents => '{networking}', x => 'b6')$$),
  'coii:invalid_intents', 'only known intents');
select is(tests.fails($$select tests.try_join(intents => '{hiring,hiring}', x => 'b7')$$),
  'coii:invalid_intents', 'no repeated intents');

-- ---- one-liners -----------------------------------------------------------------------------------
select is(tests.fails($$select tests.try_join(lines => '{"see https://scam.example"}', x => 'c1')$$),
  'coii:link_not_allowed', 'https:// links are refused');
select is(tests.fails($$select tests.try_join(lines => '{"go to www.thing"}', x => 'c2')$$),
  'coii:link_not_allowed', 'www. links are refused');
select is(tests.fails($$select tests.try_join(lines => '{"mint at foo.xyz"}', x => 'c3')$$),
  'coii:link_not_allowed', 'bare domains are refused');
select is(tests.fails($$select tests.try_join(lines => '{"dm me t.me/x"}', x => 'c4')$$),
  'coii:link_not_allowed', 't.me links are refused');
select is(tests.fails($$select tests.try_join(lines => array['claim at scam' || U&'\200B' || '.xyz'], x => 'c10')$$),
  'coii:link_not_allowed', 'a zero-width space can''t hide a link in a one-liner');
select is(tests.fails($$select tests.try_join(lines => '{"airdrop at claimdrop.ai"}', x => 'c11')$$),
  'coii:link_not_allowed', 'any word.word with 2+ letters after the dot is a link (.ai)');
select is(tests.fails($$select tests.try_join(lines => '{"docs on coii.dev"}', x => 'c12')$$),
  'coii:link_not_allowed', '.dev too');
select is(tests.fails($$select tests.try_join(lines => '{"yield at max.finance"}', x => 'c13')$$),
  'coii:link_not_allowed', 'and long endings like .finance');
select is(tests.try_join(lines => '{"rolled out v2.0","gas is 3.5 gwei"}', x => 'c14') -> 'one_liners',
  '["rolled out v2.0", "gas is 3.5 gwei"]'::jsonb, 'numbers after the dot are fine');
select is(tests.fails($$select tests.try_join(name => 'claimdrop.ai team', x => 'c15')$$),
  'coii:name_link_not_allowed', 'a domain in a name is refused too');
select is(tests.fails($$select tests.try_join(lines => '{"dm @zara_builds for alpha"}', x => 'c16')$$),
  'coii:mention_not_allowed', '@usernames aren''t allowed in one-liners (handles show after a wave)');
select is(tests.try_join(lines => '{"meet me @ the chai stall"}', x => 'c17') -> 'one_liners',
  '["meet me @ the chai stall"]'::jsonb, 'a lone @ is fine');
select is(tests.try_join(lines => '{"I like DeFi.","shipped v2.0 today"}', x => 'c5') -> 'one_liners',
  '["I like DeFi.", "shipped v2.0 today"]'::jsonb, 'a sentence ending in a dot and v2.0 are fine');
select is(tests.fails($$select tests.try_join(lines => '{a,b,c,d}', x => 'c6')$$),
  'coii:invalid_one_liner', 'at most three one-liners');
select is(tests.fails($$select tests.try_join(lines => array[repeat('a', 81)], x => 'c7')$$),
  'coii:invalid_one_liner', 'one-liners are at most 80 characters');
select is(tests.try_join(lines => array['  gm  ', 'GM', '', 'hello   world'], x => 'c8') -> 'one_liners',
  '["gm", "hello world"]'::jsonb, 'one-liners are cleaned: trimmed, collapsed, no blanks or repeats');
select is(tests.try_join(lines => array['a', 'b', 'c', 'A'], x => 'c9') -> 'one_liners',
  '["a", "b", "c"]'::jsonb, 'a fourth line that repeats one of three is dropped, not refused');

-- ---- avatar ---------------------------------------------------------------------------------------
select is(tests.fails($$select tests.try_join(avatar => '{6,0,0,0}', x => 'd1')$$),
  'coii:invalid_avatar', 'skin 0–5');
select is(tests.fails($$select tests.try_join(avatar => '{0,12,0,0}', x => 'd2')$$),
  'coii:invalid_avatar', 'hair 0–11');
select is(tests.fails($$select tests.try_join(avatar => '{0,0,9,0}', x => 'd3')$$),
  'coii:invalid_avatar', 'hair colour 0–8');
select is(tests.fails($$select tests.try_join(avatar => '{0,0,0,4}', x => 'd4')$$),
  'coii:invalid_avatar', 'accessory 0–3');
select is(tests.fails($$select tests.try_join(avatar => '{0,0,0}', x => 'd5')$$),
  'coii:invalid_avatar', 'exactly four avatar values');

-- ---- handles --------------------------------------------------------------------------------------
select is(tests.fails($$select tests.try_join(telegram => null, x => null)$$),
  'coii:handle_required', 'a Telegram or X handle is required');
select is(tests.fails($$select tests.try_join(telegram => 'abcd', x => null)$$),
  'coii:invalid_telegram', 'Telegram usernames have at least 5 characters');
select is(tests.fails($$select tests.try_join(telegram => '1abcde', x => null)$$),
  'coii:invalid_telegram', 'Telegram usernames start with a letter');
select is(tests.fails($$select tests.try_join(x => 'sixteen_chars_xx')$$),
  'coii:invalid_x', 'X handles are at most 15 characters');
select is(tests.fails($$select tests.try_join(x => 'bad-x')$$),
  'coii:invalid_x', 'X handles are letters, digits and underscores');

select tests.try_join(telegram => 'priya_builds', x => 'priya_x');
select is(tests.fails($$select tests.try_join(telegram => 'PRIYA_BUILDS', x => null)$$),
  'coii:handle_taken', 'a Telegram username already on coii is taken (any case)');
select is(tests.fails($$select tests.try_join(telegram => null, x => 'Priya_X')$$),
  'coii:handle_taken', 'an X handle already on coii is taken (any case)');

-- ---- consent, sessions and edits --------------------------------------------------------------------
select is(tests.fails($$select tests.try_join(consent => false, x => 'e1')$$),
  'coii:consent_required', 'joining needs consent');

select tests.claim(null);
select is(tests.fails($$select public.upsert_profile('A', '{ai}', '{}', '{}', '{0,0,0,0}', null, 'e2', true)$$),
  'coii:not_signed_in', 'no session, no profile');
select is(tests.fails($$select public.get_me()$$), 'coii:not_signed_in', 'get_me needs a session');

select tests.claim(tests.new_user());
select is(public.get_me(), null, 'get_me is null before you join');
select is(tests.fails($$select public.wave(gen_random_uuid())$$), 'coii:no_profile',
  'wave needs a profile');
select is(tests.fails($$select public.get_meet_state()$$), 'coii:no_profile',
  'get_meet_state needs a profile');

-- Editing keeps consent_at even without consent, and changing the Telegram handle of a verified
-- profile clears the badge.
create temp table edited as
  select tests.join('Asha Rao', '{privacy}', 'asha_builds') as id;
update private.people set telegram_verified = true, consent_at = '2026-10-01' where id = (select id from edited);
select tests.act((select id from edited));
select public.upsert_profile('Asha R', '{privacy}', '{}', '{}', '{0,0,0,0}', 'asha_builds', null, false);
select ok((select telegram_verified and consent_at = '2026-10-01' from private.people where id = (select id from edited)),
  'an edit keeps consent_at and the badge when the Telegram handle stays');
select public.upsert_profile('Asha R', '{privacy}', '{}', '{}', '{0,0,0,0}', 'asha_rao_new', null, false);
select ok((select not telegram_verified from private.people where id = (select id from edited)),
  'changing the Telegram handle of a verified profile clears the badge');

select * from finish();
rollback;
