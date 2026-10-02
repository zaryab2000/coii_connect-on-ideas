-- Shared helpers for the pgTAP suite. Included with `\ir _helpers.inc` inside each test's
-- transaction, so everything here is rolled back with the test.

create extension if not exists pgtap with schema extensions;
create schema tests;

-- A fresh anonymous auth user.
create function tests.new_user() returns uuid
language sql as $$
  insert into auth.users (id, aud, role, is_anonymous)
  values (gen_random_uuid(), 'authenticated', 'authenticated', true)
  returning id
$$;

-- Makes auth.uid() return this user for the rest of the transaction (role is set separately).
create function tests.claim(uid uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

create function tests.user_of(person uuid) returns uuid
language sql as $$ select user_id from private.people where id = person $$;

-- Acts as the owner of this bean (claims only; call `set local role authenticated` to drop
-- privileges as well).
create function tests.act(person uuid) returns void
language sql as $$ select tests.claim(tests.user_of(person)) $$;

-- Joins a new person through the real API and returns their bean id.
create function tests.join(
  name text,
  topics text[] default '{ai}',
  telegram text default null,
  x text default null
) returns uuid
language plpgsql as $$
declare
  uid uuid := tests.new_user();
  handle text := coalesce(telegram, 'tg' || substr(md5(random()::text), 1, 10));
begin
  perform tests.claim(uid);
  perform public.upsert_profile(name, topics, '{}', '{}', '{1,2,3,0}', handle, x, true);
  return (select id from private.people where user_id = uid);
end;
$$;

-- A demo bean straight into the table (like the seed does).
create function tests.demo(name text, topics text[] default '{ai}') returns uuid
language plpgsql as $$
declare
  person uuid;
begin
  insert into private.people (source, name, topics, skin, hair, hair_color, accessory)
  values ('demo', name, topics, 0, 0, 0, 0)
  returning id into person;
  insert into private.contacts (person_id, telegram)
  values (person, 'demo' || substr(md5(person::text), 1, 10));
  return person;
end;
$$;

-- `wave(target)` as `person`, returning just the result word.
create function tests.wave(person uuid, target uuid) returns text
language plpgsql as $$
begin
  perform tests.act(person);
  return public.wave(target) ->> 'result';
end;
$$;

-- True when the stored counters match a full recount from waves.
create function tests.points_consistent() returns boolean
language sql as $$
  select not exists (
    select 1 from private.people p
    where p.wave_points <> (select count(*) from private.waves w where w.to_id = p.id)
  ) and not exists (
    select 1 from (
      select coalesce(d.meet_day, w.meet_day) as day, coalesce(d.person_id, w.to_id) as person,
             coalesce(d.points, 0) as stored, coalesce(w.n, 0) as counted
      from private.daily_points d
      full join (select meet_day, to_id, count(*) as n from private.waves group by 1, 2) w
        on w.meet_day = d.meet_day and w.to_id = d.person_id
    ) x where stored <> counted
  )
$$;
