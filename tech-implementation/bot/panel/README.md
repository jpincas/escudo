# Escudo — panel

The admin panel for the village bot: the roster of alert devices (base stations, pendants, watches,
phones) that a coordinator registers, edits and retires. A React SPA served at `/panel` by the bot's
own Deno app; it holds no state of its own beyond the session cookie the API sets.

There is no login form. The only way in is a magic link the bot sends in Telegram (`/panel`), which
this app exchanges for a session cookie on first load.

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

Then open `http://localhost:5173/panel/?t=<a token from the bot>`, or just
`http://localhost:5173/panel/` if a session cookie is already set.

## Build

```bash
npm run build
```

Type-checks with `tsc`, then outputs static files to `dist/`. The Deno app serves that directory at
`/panel` in production — `vite.config.ts` sets `base: "/panel/"` so every built asset URL matches.

## Stack

Vite + React + TypeScript. No router, no UI kit, no CSS framework, no data-fetching library — the
app is one screen, `fetch` is enough, and one hand-written stylesheet (`src/styles.css`) covers it.
The only dependencies are `react` and `react-dom`.

## Layout

```
src/
  api/          wire types + the one fetch client (src/api/client.ts)
  hooks/        useSession (auth), useDevices (the CRUD list)
  components/   one file per piece of UI
  strings.ts    every UI string, in one place — Spanish, for translation later
  format.ts     the one date formatter
  App.tsx       session gate: signed-out screen vs. the devices screen
  main.tsx      React mount
```
