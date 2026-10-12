-- hand_inputs() for dealing hands (docs/prd/database.md §9.1): the cheaper "inbound" (points minus
-- chais) must equal the original definition, unanswered waves counted one by one.
begin;
\ir _helpers.inc
select plan(4);

create temp table cast_ as
select tests.join('Asha Rao', '{privacy}', 'asha_builds', null) as asha,
       tests.join('Ravi Kumar', '{privacy}', 'ravi_builds', null) as ravi,
       tests.join('Mei Lin', '{privacy}', 'mei_builds', null) as mei,
       tests.join('Omar Ali', '{privacy}', 'omar_builds', null) as omar;

-- Ravi gets two unanswered waves; Mei and Omar end up with a chai (both waves answered).
select tests.wave((select asha from cast_), (select ravi from cast_));
select tests.wave((select mei from cast_), (select ravi from cast_));
select tests.wave((select mei from cast_), (select omar from cast_));
select tests.wave((select omar from cast_), (select mei from cast_));

create temp table inputs as
select public.hand_inputs(tests.user_of((select asha from cast_))) as j;

-- The original definition: waves to each candidate the candidate hasn't returned.
create temp table expected as
select coalesce(jsonb_object_agg(to_id, n), '{}'::jsonb) as j from (
  select w.to_id, count(*) as n
  from private.waves w
  join private.people p on p.id = w.to_id and p.status = 'visible'
  where w.to_id <> (select asha from cast_)
    and w.to_id not in (select to_id from private.waves where from_id = (select asha from cast_))
    and not exists (select 1 from private.waves r where r.from_id = w.to_id and r.to_id = w.from_id)
  group by w.to_id
) i;

select is((select j -> 'inbound' from inputs), (select j from expected),
  'inbound equals unanswered waves counted one by one (seed data included)');
select is((select (j -> 'inbound' ->> (select mei::text from cast_)) from inputs), null,
  'a chai leaves no unanswered wave');
select ok(not exists (select 1 from inputs, jsonb_array_elements(j -> 'candidates') as c
                      where c ? 'name'),
  'candidates carry no names');
select ok((select jsonb_array_length(j -> 'candidates') from inputs) > 0, 'candidates are listed');

select * from finish();
rollback;
