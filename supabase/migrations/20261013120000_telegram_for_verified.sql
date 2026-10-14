-- coii backend, part 9: Telegram usernames only for people who verified their own Telegram.
--
-- A wave still unlocks someone's X handle (a public profile anyway). Their Telegram username is a
-- private DM, so a wave (and get_contacts) only returns it when the caller has verified their own
-- Telegram (people.telegram_verified, set by the telegram-link Edge Function). Otherwise it comes
-- back null with "telegram_locked": true, and the app offers "Verify your Telegram to message them".
-- A verified Telegram account holds one bean at most, so harvesting Telegram usernames with
-- throwaway accounts now needs a real Telegram account for every 50.
--
-- Same shapes as before plus one field: the app that is live now keeps working (it just shows no
-- Telegram button to people who haven't verified).

-- What a wave reveals about `person` to the signed-in caller (wave() calls this for its result).
create or replace function private.contacts_of(person uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with viewer as (
    select coalesce((select p.telegram_verified from private.people p
                     where p.user_id = (select auth.uid())), false) as sees_telegram
  )
  select jsonb_build_object(
    'telegram', case when v.sees_telegram then c.telegram end,
    'x', c.x,
    'telegram_locked', c.telegram is not null and not v.sees_telegram)
  from private.contacts c, viewer v
  where c.person_id = person
$$;

-- Handles for people you have waved at (a chai means you have), by the same rule. Never an
-- invited bean's (part 8).
create or replace function public.get_contacts(ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
begin
  if cardinality(ids) > 200 then
    raise exception 'coii:too_many';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.person_id,
      'telegram', case when me.telegram_verified then c.telegram end,
      'x', c.x,
      'telegram_locked', c.telegram is not null and not me.telegram_verified))
    from private.contacts c
    join private.waves w on w.to_id = c.person_id and w.from_id = me.id
    join private.people p
      on p.id = c.person_id and p.status = 'visible' and p.source <> 'invited'
    where c.person_id = any (ids)
  ), '[]'::jsonb);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.get_contacts(uuid[]) from public, anon;
grant execute on function public.get_contacts(uuid[]) to authenticated;
