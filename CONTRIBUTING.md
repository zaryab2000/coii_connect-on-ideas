# Contributing to coii

Ideas and fixes are welcome. Open an issue with the
[feature request form](https://github.com/zaryab2000/coii_connect-on-ideas/issues/new?template=feature_request.md),
or build it yourself and open a pull request.

## Run coii locally

You need Node 24 and pnpm 10. No secrets or accounts: without Supabase settings coii runs in
**demo mode**, with a generated crowd, simulated arrivals and waves, all in your browser.

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

Add `?still` to the URL to stop new arrivals (handy while you work), or `?debug` for an FPS
overlay. The [README](README.md) lists the rest.

## Before you open a pull request

```bash
pnpm check      # format, lint, types and unit tests
pnpm test:e2e   # the browser tests, in demo mode
```

Both should pass. Changes to the database (`supabase/`) also need the local Supabase stack and
`supabase test db`; say in the PR if you couldn't run it and a maintainer will.

## Opening the pull request

- Branch from `main` and open the PR against `main`.
- Keep it to one change, and say what it does and how you checked it.
- Add or update tests for what you changed.
- Screenshots help for anything people see (phone and desktop).
