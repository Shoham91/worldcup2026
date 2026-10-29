# 🌍⚽ World Cup 2026 Prediction Pool

A small full-stack app for running a World Cup 2026 prediction league with
friends or coworkers. Players register with a shared join code, lock blind
title picks, predict group standings and every match scoreline, and climb a
live, auto-scored leaderboard — real results are pulled in automatically.

It ran live for a ~20-player office pool for the whole tournament (June–July
2026) on the free tiers of Vercel and Neon.

Built with **Next.js 16** (App Router) · **Prisma 6** · **Postgres** (Neon) ·
**Tailwind CSS v4**. Installable as a PWA on iOS/Android.

---

## Features

- 🔐 **Name + PIN login** (bcrypt) with HMAC-signed cookie sessions. Signup is
  gated by a shared join code and closes itself at tournament kickoff.
- 🔮 **Blind title picks** at signup — champion, a finalist, and the Golden Boot
  (curated per-team dropdown or free text). Editable until the opener.
- 📊 **Group stage, group by group** — pick 1st & 2nd and a scoreline for each
  of the group's six games. Partial saves are fine.
- 🏆 **Rolling knockout rounds** — for every tie pick who advances and the
  90-minute scoreline.
- ⏱ **Per-match locking** — each game locks 10 minutes before its kickoff; a
  group's standings pick locks at that group's first kickoff.
- 🎲 **"TF Should I Know?! Random!"** — weighted random scores per field or for
  a whole form. The same mechanism auto-fills anything left empty at lock time.
- 🔄 **Automatic results** from [football-data.org](https://www.football-data.org):
  group scores, standings, knockout fixtures and winners, top-scorer chart,
  champion and runner-up. Admin can still override anything by hand, or pause
  the sync.
- 📈 **Live leaderboard** with per-category breakdown, a **Today** page with
  today's games and live points, everyone's picks revealed once they lock, a
  bracket view, and a rules page generated from the scoring constants.
- 🛠 **Admin area** — phases and lock times, auto-fill, buy-in and pot, paid
  flags, manual results, fixing a player's pick, specials.
- 📱 **PWA** manifest + generated icons. No service worker on purpose, so
  nobody sees a stale page during a live game.

---

## Quick start

You need Node 20+ and a Postgres database. A free [Neon](https://neon.tech)
project works well, but any Postgres URL does.

```bash
npm install
cp .env.example .env     # fill in the database URLs and secrets
npm run db:push          # create the schema
npm run db:seed          # 48 teams, 12 groups, 72 fixtures, knockout skeleton, admin user
npm run dev              # http://localhost:3000
```

- **Admin login:** name `admin` · PIN `1234`. Change it before sharing the app
  (edit the seed and re-run it, or use `npm run db:studio`).
- Players self-register at `/signup` with the join code.

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres pooled connection, used by the app |
| `DIRECT_URL` | Postgres direct connection, used by `prisma db push` |
| `SESSION_SECRET` | Long random string that signs login cookies |
| `JOIN_CODE` | Shared code required to register |
| `FOOTBALL_DATA_TOKEN` | Free football-data.org API token for the results sync |
| `SYNC_SECRET` | Guards the `GET /api/sync` endpoint |

---

## How the pool works

### Prediction windows

1. **Title picks** — champion, a finalist, and the top scorer. Made at signup,
   editable on `/predict/picks` until the group phase locks (30 minutes before
   the opening game), then frozen for the tournament.
2. **Group stage** — one form per group at `/predict/group/[letter]`: who
   finishes 1st and 2nd, plus a scoreline for each game. Every game locks 10
   minutes before its own kickoff. The 1st/2nd pick locks at the group's first
   kickoff. There is no 3rd-place pick; the best third-placed teams simply show
   up in the Round of 32.
3. **Knockout rounds** — the admin opens each round once its fixtures are
   known (the sync fills them in). For every tie you pick the team that
   advances and the 90-minute scoreline. Each tie locks 10 minutes before
   kickoff.

Miss a deadline and the auto-fill gives you a weighted random pick (0–6 goals,
skewed towards realistic scores). Once something locks, everyone's picks for it
become visible on the **Predictions** page.

### Scoring

All values live in `lib/points.ts`; the rules page reads from the same file.

| Category | Points |
|---|---|
| Title picks — champion / top scorer / finalist | +60 / +50 / +30 |
| Group — each team correctly picked in the top 2 | +4 |
| Group — exact 1st & 2nd order | +5 |
| Scoreline — exact / result + goal difference / result only (group, R32, R16) | +5 / +3 / +2 |
| Scoreline — same, from the quarter-finals on | +8 / +5 / +3 |
| Knockout advancer — R32 / R16 / QF / SF / 3rd place / Final | +4 / +6 / +8 / +12 / +4 / +20 |

Scorelines are graded on the 90-minute score. Extra time and penalties only
decide who advances.

**Prizes:** pot = paid players × buy-in (default 50, admin-editable), split
**70% / 20% / 10%** to 1st / 2nd / 3rd. Shown as projected until the admin
closes registration.

**Tiebreakers:** champion correct → top scorer correct → most correct knockout
winners → name.

---

## Results sync and cron

`GET /api/sync?key=<SYNC_SECRET>` pulls the latest data from football-data.org
(competition `WC`, covered by the free tier), updates scores, standings,
fixtures, the top-scorer chart and the champion, and then auto-fills any
prediction whose lock time has passed.

Point an external cron at it. The pool used [cron-job.org](https://cron-job.org)
every 5 minutes. Keep the interval shorter than the 10-minute lock lead so the
auto-fill always lands between lock and kickoff. The admin overview also has a
**Sync now** button and an on/off toggle for the results sync; the auto-fill
runs regardless because it is a game rule.

Times are displayed in `Asia/Jerusalem` (see `lib/datetime.ts` and the Today
page). Change the time zone there to suit your pool.

---

## Admin area

- **Overview** — open or close each phase and set its lock time, auto-fill a
  phase, set the buy-in, close registration to finalise the pot, mark players
  as paid, sync now, pause the sync.
- **Group Standings** — each team's final group position (normally set by the
  sync once a team has played three games).
- **Group Scores** — scorelines and kickoff times for the 72 group games.
- **Knockout** — per round: set the two teams and kickoff for each fixture,
  then the score and who advanced.
- **Picks** — edit any player's prediction, for the inevitable "I swear I
  submitted it" case.
- **Specials** — champion, runner-up and Golden Boot, which grade the title
  picks.

Scores recompute on every request, so the leaderboard is always live.

---

## Project layout

```
app/
  (main)/          player area — dashboard, today, leaderboard, predictions, bracket, rules, predict/*
  (admin)/         admin area — overview, groups, group-matches, ko/[round], picks, specials
  actions/         server actions (auth, predictions, admin)
  api/sync/        results sync + auto-fill endpoint (the cron target)
  login, signup    auth screens
  manifest.ts      PWA manifest
components/        forms, nav, random buttons, auto-refresh, sticky tables
lib/
  points.ts        every scoring value and round constant
  scoring.ts       the scoring engine (single source of truth)
  phases.ts        open/lock logic, per phase and per match
  autofill.ts      random fill for missed deadlines
  random.ts        shared weighted randomiser (🎲 buttons + auto-fill)
  sync.ts          football-data.org importer
  prizes.ts        pot split
  session.ts       signed-cookie sessions
  auth.ts          getCurrentUser / requireUser / requireAdmin
  prisma.ts        Prisma client singleton
prisma/
  schema.prisma    data model
  seed.mjs         teams, scorer candidates, fixtures, phases, admin user
scripts/
  gen-icons.mjs          dependency-free PNG generator for the PWA icons
  analyze-race.mjs       who can still win or reach the podium (mid-tournament)
  analyze-positions.mjs  best and worst possible finish per player
  final-table.mjs        official final table with tiebreakers
```

---

## Deploy (Vercel + Neon)

1. **Neon** → new project → copy both the pooled connection string (host
   contains `-pooler`) and the direct one.
2. Locally, put them in `.env` and run `npm run db:push && npm run db:seed`.
3. **Vercel** → import the repo → add the six environment variables → deploy.
4. Create a cron job that calls
   `https://<your-app>.vercel.app/api/sync?key=<SYNC_SECRET>` every 5 minutes.
5. Share the link and the join code.

> Name + PIN plus a shared join code is plenty for a trusted group. For a truly
> public deployment you would want real authentication.

---

## License

[MIT](LICENSE)
