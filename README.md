# gm coii

Find your people at Devcon by **ideas**, not logos. A live cartoon venue where every booth is a
topic and every attendee is a tiny bean person hanging around the booths they care about. Tap
someone to see what they want to talk about and how to reach them.

> **coii**: connect on ideas & interests.

This is the **demo** build: the crowd is generated (70% Indian, 30% international names) and
contact buttons are disabled for demo people. Product plan: [PLAN.md](PLAN.md).

## Run it

```bash
pnpm install          # Node 24, pnpm 10
pnpm dev              # http://localhost:5173 (also on your LAN for phone testing)
```

URL switches (combine with `&`):

| Param    | Effect                                                       |
| -------- | ------------------------------------------------------------ |
| `?debug` | FPS / frame time / particle overlay                          |
| `?still` | No live demo arrivals (handy for screenshots and tests)      |
| `?n=800` | Crowd size (10–4000, default 1500)                           |
| `?res=1` | Force canvas resolution (default `min(devicePixelRatio, 2)`) |

In dev builds `window.__coii` exposes `{ engine, controller }` for scripting.

## Scripts

| Command         | What it does                                                            |
| --------------- | ----------------------------------------------------------------------- |
| `pnpm check`    | Format check, lint (zero warnings), type check, unit tests              |
| `pnpm test`     | Unit and property tests (vitest + fast-check)                           |
| `pnpm test:e2e` | Browser smoke tests on desktop and phone viewports (uses system Chrome) |
| `pnpm build`    | Type check + production build into `dist/`                              |

Git hooks run through [prek](https://github.com/j178/prek): `prek install` once, then every commit
runs the same checks as `pnpm check`.

## How it works

```
src/
  data/    demo crowd generator, topics, handles, people source (demo timer today)
  sim/     pure-TS crowd simulation: layout, spots, steering, grab/throw physics (unit-tested)
  engine/  PixiJS venue: one ParticleContainer draws the whole crowd, own camera + gestures
  app/     store + controller (the only place UI actions reach the engine)
  ui/      React panels, HUD, sheets, design tokens
```

- **One draw call crowd.** All bean parts are drawn once with Canvas2D into a mip-mapped atlas;
  each frame the visible crowd is written into a single `ParticleContainer` in depth order.
- **Simulation is client-side.** Movement is simulated in every browser at 30 Hz; it never
  represents anyone's real location. The server (later) only needs to know who is interested in
  what.
- **Engine outside React.** The engine is a module singleton; React only attaches its canvas, so
  StrictMode and re-renders never create a second WebGL context.
- **Accessible alternative.** Booth labels are real buttons, and the People list mirrors
  everything on the map.

## Credits

Emoji icons: [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (MIT, see
`src/assets/icons/LICENSE-fluentui-emoji.txt`). Fonts: Baloo 2 and Mukta by Ek Type (OFL).
