-- coii backend, part 6: a cheaper hand_inputs() for the 06:00 rush (pre-release tracker P12).
-- The load test (5,000 beans, 150,000 waves) measured ~170 ms of database time per deal, most of
-- it counting unanswered waves by scanning every wave. Two changes, same results:
--   - inbound = wave_points minus the person's chais (each answered wave is exactly one chai;
--     pgTAP 08_hand_inputs.sql checks this against the old definition);
--   - candidates no longer carry names, which dealing never reads (a smaller payload).

create or replace function public.hand_inputs(user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me private.people;
  today date := private.current_meet_day();
  hand private.daily_hands;
  excluded uuid[];
begin
  select * into me from private.people p where p.user_id = hand_inputs.user_id;
  if not found then
    raise exception 'coii:no_profile';
  end if;
  select * into hand from private.daily_hands h where h.person_id = me.id and h.meet_day = today;
  if not private.hand_needs_deal(hand) then
    return jsonb_build_object('ready', true, 'hand', private.hand_json(me.id, today));
  end if;

  excluded := array(
    select to_id from private.waves where from_id = me.id
    union select case when a_id = me.id then b_id else a_id end from private.chais
          where me.id in (a_id, b_id)
    union select skipped_id from private.skips where person_id = me.id and until_day > today
    union select blocked_id from private.blocks where blocker_id = me.id
    union select blocker_id from private.blocks where blocked_id = me.id
  );

  return jsonb_build_object(
    'ready', false,
    'day', today,
    'now', now(),
    'viewer', jsonb_build_object('id', me.id, 'name', me.name, 'topics', to_jsonb(me.topics),
      'intents', to_jsonb(me.intents), 'one_liners', to_jsonb(me.one_liners),
      'joined_at', me.joined_at, 'source', me.source),
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'topics', to_jsonb(p.topics),
        'intents', to_jsonb(p.intents), 'one_liners', to_jsonb(p.one_liners),
        'joined_at', p.joined_at, 'source', p.source))
      from private.people p where p.status = 'visible' and p.id <> me.id
    ), '[]'),
    'excluded', to_jsonb(excluded),
    'recent_hands', coalesce((
      select jsonb_agg(jsonb_build_object('day', h.meet_day, 'cards', h.cards))
      from private.daily_hands h
      where h.person_id = me.id and h.meet_day between today - 3 and today - 1
    ), '[]'),
    'waved_at_viewer', coalesce((
      select jsonb_agg(from_id) from private.waves where to_id = me.id
    ), '[]'),
    -- Unanswered waves per eligible candidate (to spread attention). Every answered wave is a
    -- chai, so that's their points minus their chais: no scan of every wave in the venue.
    'inbound', coalesce((
      select jsonb_object_agg(p.id, p.wave_points - coalesce(c.n, 0))
      from private.people p
      left join (
        select x, count(*) as n
        from (select a_id as x from private.chais union all select b_id from private.chais) both_sides
        group by x
      ) c on c.x = p.id
      where p.status = 'visible'
        and p.id <> me.id
        and not (p.id = any (excluded))
        and p.wave_points > coalesce(c.n, 0)
    ), '{}'),
    'exposure', coalesce((
      select jsonb_object_agg(pid, n) from (
        select card ->> 'personId' as pid, count(*) as n
        from private.daily_hands h, jsonb_array_elements(h.cards) as card
        where h.meet_day = today group by 1
      ) x
    ), '{}'),
    'hands_today', (select count(*) from private.daily_hands where meet_day = today),
    'hand', case when hand.person_id is null then null
                 else jsonb_build_object('cards', hand.cards, 'bonus', hand.bonus) end
  );
end;
$$;
