# Database runbook

Copy-paste operations for the coii Supabase project (`coii`, ref `fqemvlxftoixmihcmhmt`). Run SQL in
**Dashboard → SQL Editor** (it runs as `postgres`, which can see the `private` schema). The spec is
[docs/prd/database.md](../prd/database.md).

> Draft: backups and restore (Phase 6) are added when the backup workflow exists.

> **Launch gate:** no public posts about coii (Devcon Telegram group, X) until the Cloudflare cache
> in front of `get_venue` is live (PRD §13). Friends and testers are fine before that.

## Find a bean

```sql
-- By name (case-insensitive), with handles and status.
select p.id, p.name, p.status, p.wave_points, p.source, c.telegram, c.x, p.joined_at
from private.people p left join private.contacts c on c.person_id = p.id
where p.name ilike '%asha%'
order by p.joined_at desc;

-- By handle.
select p.id, p.name, p.status from private.people p
join private.contacts c on c.person_id = p.id
where lower(c.telegram) = lower('asha_builds') or lower(c.x) = lower('asha_builds');
```

## Hide or unhide a bean

Hidden beans vanish from every map within a minute, can't wave, can't be waved at, can't report
anyone, and their handles stay locked even for people who waved earlier. Their own profile still
works. Always use these functions (a raw `update` would skip the bookkeeping):

```sql
select private.hide('<person id>');    -- hidden_reason = 'admin'
select private.unhide('<person id>');  -- marks their reports reviewed, so one new report can't
                                       -- hide them again
```

`unhide` refuses (`coii:no_handle`) a bean hidden for impersonation: it lost its only handle to
the verified owner and must add a new one first.

## Delete a bean for good

Deleting the auth user removes the bean, handles, waves (other people's points drop), chais,
hands, skips, blocks and reports. Demo beans have no auth user; delete those from `people`.

```sql
delete from auth.users where id = (select user_id from private.people where id = '<person id>');
delete from private.people where id = '<person id>' and source = 'demo';
```

## Reports queue

Three reports that count hide a bean automatically. A report counts only if nobody has reviewed
it yet and the reporter's bean was at least 24 hours old when they reported; reports from newer
accounts are kept here for you but never count. Review the queue daily during the event.

```sql
select p.id, p.name, p.status, p.hidden_reason,
       count(*) as reports,
       count(*) filter (where private.report_counts(r)) as counting,
       array_agg(r.reason order by r.created_at) as reasons, max(r.created_at) as latest
from private.reports r join private.people p on p.id = r.person_id
group by p.id order by latest desc;
```

## Blocked name terms

Names containing any term are refused (`coii:name_blocked`). Lowercase only; no deploy needed.

```sql
select term from private.blocked_terms order by term;
insert into private.blocked_terms (term) values ('giveaway');
delete from private.blocked_terms where term = 'giveaway';
```

## Repair points

If the board ever looks off, rebuild all-time points and today's points from the waves.

```sql
select private.recount_points();
```

## Launch day: remove the demo crowd

```sql
select private.purge_demo();  -- returns how many demo beans were removed
```

Open maps drop them within a minute (tombstones). Real people's points from demo waves drop too.

## Scheduled jobs

| Job                 | When (UTC)        | Does                                                           |
| ------------------- | ----------------- | -------------------------------------------------------------- |
| `orphan-anon-users` | daily 22:00       | Deletes anonymous sessions older than 24 h that have no bean   |
| `prune-tombstones`  | daily 22:10       | Deletes removal markers older than 30 days                     |
| `post-event-purge`  | 6 Dec 2026, 00:00 | Forgets waves, chais, hands and skips, then unschedules itself |

```sql
select jobname, schedule, active from cron.job order by jobname;
select jobname, status, start_time, return_message
from cron.job_run_details d join cron.job j using (jobid)
order by start_time desc limit 20;
```

## Usage checks

Dashboard → **Usage**. Check weekly, and daily from 1 Nov. The event (3–6 Nov) falls in the
billing cycle that starts 2 Nov.

| Metric              | Free limit    | Act when                                                                  |
| ------------------- | ------------- | ------------------------------------------------------------------------- |
| Egress              | 5 GB / month  | Over 60% before 3 Nov: lengthen venue polling to 120 s and tell the owner |
| Database size       | 500 MB        | Over 50%                                                                  |
| Realtime peak       | 200           | Over 150 (clients fall back to 60 s polling, which is fine)               |
| Realtime messages   | 2 M / month   | Over 50%                                                                  |
| Edge Function calls | 500 k / month | Over 50%                                                                  |

## Rate limits before the event

By 27 Oct, in Dashboard → Authentication → Rate Limits (venue Wi-Fi is one IP): anonymous
sign-ins per hour → 1,000; sign-ins and sign-ups per 5 min → 300; token refreshes per 5 min →
1,000.

## If the project pauses

Free projects pause after 7 days without activity (the nightly backup keeps it awake once that
exists). Dashboard → project → **Restore**. Nothing is lost; it takes a few minutes.

## Local development

```sh
supabase start                         # local stack (Docker)
pnpm db:seed && supabase db reset      # schema + 1,500 demo beans (db:seed needs Deno)
supabase test db                       # pgTAP: invariants, validation, operations
pnpm test:db                           # resets + seeds, then integration + Edge Functions over
                                       # HTTP (needs internet for Turnstile's test endpoint;
                                       # --no-reset keeps the current data)
pnpm test:functions                    # Deno unit tests (Telegram signature, dealing)
pnpm sync:shared                       # after changing src/match/* or src/data/{types,topics,intents,affinity}
```

Never run `supabase config push`: `supabase/config.toml` holds local URLs and test keys.
Production auth settings are set in the dashboard (PRD §10, §19).
