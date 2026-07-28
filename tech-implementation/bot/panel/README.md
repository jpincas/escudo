# Escudo — panel

The admin panel for the village bot: a sidebar of sections — Devices, Inbox, History, Config — for a
coordinator to run the alert system day to day. A React SPA served at `/panel` by the bot's own Deno
app; it holds no state of its own beyond the session cookie the API sets.

There is no login form in this app. The only way in is a one-time code the bot sends in Telegram
(`/panel`), typed into the public login page the bot's own Deno app serves at bare `/panel` when
there is no session — that page lives in `src/web/login.ts` on the bot side, not here.

## Develop

```bash
npm install
npm run dev
```

The dev server proxies `/api` to `http://localhost:8000`, so the bot's own API has to be running
first:

```bash
# in the bot's own directory, a separate terminal
deno task dev
```

The Vite dev server only serves this SPA, not the login page — that's server-rendered by the bot's
own app at :8000. Sign in there (`http://localhost:8000/panel`, using a code from `/panel` in
Telegram or from `deno run mint-dev-link.ts` in offline dev mode), then open
`http://localhost:5173/panel/`: it shares the same cookie, since both answer on `localhost`.

## Build

```bash
npm run build
```

Type-checks with `tsc`, then outputs static files to `dist/`. The Deno app serves that directory at
`/panel` in production — `vite.config.ts` sets `base: "/panel/"` so every built asset URL matches.
From the bot's own directory, `deno task build` runs this (via `deno task panel:typecheck` then
`vite build`) — that typecheck is the panel's real gate, since `deno task check` excludes `panel/`.

## Stack

Vite + React + TypeScript. A hand-rolled router (`src/router.ts`) over `history.pushState` for the
four static sections — no router library, no UI kit, no CSS framework, no data-fetching library.
One hand-written stylesheet (`src/styles.css`) covers the brand, plus the brand webfonts (Bricolage
Grotesque, Public Sans) loaded from Google Fonts in `index.html`. The only dependencies are `react`
and `react-dom`.

## i18n

Mirrors the bot's own `src/i18n/`: `src/i18n/types.ts` declares a `Strings` interface, `es.ts` and
`en.ts` each implement it in full, and `mod.ts` exposes a `LOCALES` map, a `strings(locale)`
accessor and a `t()` placeholder substituter. A locale missing a key is a `tsc` error, not a blank
spot in the village's language — delete a key from one locale and `deno task build` fails.

The active locale is provided by `src/i18n/context.tsx`'s `LocaleProvider`, mounted by `App.tsx` as
soon as a locale is known — from `Me.locale` once signed in, or from the `locale` field the backend
puts on a 401 from the session route, for the signed-out/error screens that have never had a
session to read one from (see `src/api/client.ts`'s `SessionResult`). `useStrings()` and `useLocale()`
read it from anywhere below.

## Layout

```
src/
  api/          wire types + the one fetch client (src/api/client.ts)
  i18n/         Strings interface, es/en implementations, LocaleProvider (see "i18n" above)
  hooks/         useSession (auth), useDevices (the CRUD list)
  router.ts      hand-rolled router: URL <-> section id
  sections.tsx   where a section registers its route, sidebar label and screen
  components/    one file per piece of UI (Sidebar, Shell, the four sections, shared modals)
  format.ts      the one date formatter, locale-aware
  App.tsx        session gate -> LocaleProvider -> signed-out screen or the signed-in Shell
  main.tsx       React mount
public/
  crest-green-neg.svg   copy of graphics/logo/green-neg.svg — see Sidebar.tsx's comment
```
