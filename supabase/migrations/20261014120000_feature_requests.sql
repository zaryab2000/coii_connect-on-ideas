-- coii backend, part 9: feature requests (docs-internal/prd/feature-requests.md).
--
-- "Got an idea for coii?": a joined person sends a short idea (a feature, a new booth, a look for
-- their bean, anything) and it's stored with their bean so the owner can reply. Only the owner
-- reads them (SQL editor / Table Editor); no API returns anyone's requests. Leaving coii keeps the
-- idea but forgets who sent it. The purges leave requests alone: they're product feedback.

-- ---- the table ----------------------------------------------------------------------------------

create table private.feature_requests (
  id         uuid primary key default gen_random_uuid(),
  -- Who sent it (the owner joins people and contacts for name and handles). Null once they leave.
  person_id  uuid references private.people (id) on delete set null,
  kind       text not null check (kind in ('feature', 'booth', 'design', 'other')),
  -- Stored cleaned (see submit_feature_request).
  body       text not null check (char_length(body) between 10 and 300),
  created_at timestamptz not null default now(),
  status     text not null default 'new' check (status in ('new', 'planned', 'done', 'declined')),
  -- The owner's private note.
  admin_note text,
  -- When the owner told the person about it.
  tagged_at  timestamptz
);

create index feature_requests_created_at_idx on private.feature_requests (created_at desc);
create index feature_requests_status_idx on private.feature_requests (status);
-- The daily limit counts a person's requests; also keeps "on delete set null" cheap.
create index feature_requests_person_idx on private.feature_requests (person_id, created_at);

alter table private.feature_requests enable row level security;
revoke all on private.feature_requests from public, anon, authenticated;

-- ---- sending one --------------------------------------------------------------------------------

-- Requests one bean can send per Meet day (06:00–06:00 IST).
create function private.feature_requests_per_day() returns integer
language sql immutable parallel safe set search_path = ''
as $$ select 3 $$;

-- Stores an idea from the caller's bean and returns its id. Cleaned like a one-liner (invisible
-- characters stripped, whitespace collapsed), then 10–300 characters. Links and @mentions are fine:
-- only the owner reads these. At most 3 per bean per Meet day. Hidden (moderated) beans can't send.
create function public.submit_feature_request(kind text, body text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me private.people := private.caller();
  cleaned text := private.clean_name(body);
  sent_today integer;
  new_id uuid;
begin
  if me.status <> 'visible' then
    raise exception 'coii:no_profile';
  end if;
  if kind is null or kind not in ('feature', 'booth', 'design', 'other')
     or cleaned is null or char_length(cleaned) not between 10 and 300 then
    raise exception 'coii:invalid_request';
  end if;
  -- One sender at a time per bean, so two quick sends can't both slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended('feature_request:' || me.id::text, 0));
  select count(*) into sent_today
    from private.feature_requests r
   where r.person_id = me.id
     and r.created_at >= now() - interval '1 day'
     and private.meet_day(r.created_at) = private.current_meet_day();
  if sent_today >= private.feature_requests_per_day() then
    raise exception 'coii:too_many_requests';
  end if;
  insert into private.feature_requests (person_id, kind, body)
  values (me.id, kind, cleaned)
  returning feature_requests.id into new_id;
  return new_id;
end;
$$;

-- ---- privileges ---------------------------------------------------------------------------------

revoke all on function private.feature_requests_per_day() from public, anon, authenticated, service_role;
revoke all on function public.submit_feature_request(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_feature_request(text, text) to authenticated;
