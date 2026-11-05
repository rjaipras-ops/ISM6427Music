# ISM6427Music

An AI music studio built on [SunoAPI.org](https://docs.sunoapi.org/). You describe a song, or write your own lyrics, and the app generates two tracks you can play and download.

## Tech stack

| Layer | What |
|---|---|
| Front end | Plain HTML, CSS and JavaScript in `public/` (no build step) |
| Back end | Netlify Functions (Node 18+, ES modules) in `netlify/functions/` |
| Music API | SunoAPI.org REST API, `https://api.sunoapi.org/api/v1`, Bearer-token auth |
| Hosting | Netlify (configured by `netlify.toml`) |

The browser never sees the Suno API key. It calls `/api/*` on your own site, and the Netlify Functions add the key on the server.

```
browser ──> /api/generate ──> Netlify Function ──> POST https://api.sunoapi.org/api/v1/generate
browser ──> /api/status   ──> Netlify Function ──> GET  .../generate/record-info?taskId=
browser ──> /api/lyrics   ──> Netlify Function ──> POST .../lyrics  /  GET .../lyrics/record-info
browser ──> /api/credits  ──> Netlify Function ──> GET  .../generate/credit
Suno    ──> /.netlify/functions/callback   (required by Suno; the app polls for results instead)
```

## Deploy on Netlify

1. In Netlify: **Add new site → Import an existing project → GitHub →** pick this repo.
2. Build settings are read from `netlify.toml` (publish `public`, functions `netlify/functions`). There's no build command.
3. **Site configuration → Environment variables**, add:
   - `SUNO_API_KEY`: your key from https://sunoapi.org/api-key (**required**)
   - `APP_PASSWORD`: any password (**optional, recommended**). If it's set, the site asks for the password before it will spend your credits.
4. Deploy. If you add or change variables after the first deploy, redeploy (**Deploys → Trigger deploy**).

> Never commit your API key to this repo. `.env` is git-ignored. Use `.env.example` as the template for local testing.

## Local development (optional)

```bash
npm install -g netlify-cli
cp .env.example .env   # then put your key in .env
netlify dev
```

## How generation works (from the SunoAPI docs)

- **Simple mode** (`customMode: false`): send a description (`prompt`, max 3000 chars) plus a `style`. Suno writes the lyrics.
- **Custom mode** (`customMode: true`): `title` (≤80), `lyrics` (≤5000), `style` (≤1000), `negativeTags`, `vocalGender` (`m`/`f`), `duration` (10–360 s), `styleWeight` / `weirdnessConstraint` (0–1), `variety` (0–4).
- **Models**: `V6` (default), `V6_WILD`, `V6_MINI`. V4/V5 models are deprecated.
- Each request returns a `taskId`. The app polls `record-info` every 8 s. Status moves `PENDING → TEXT_SUCCESS → FIRST_SUCCESS → SUCCESS`. Failures are `CREATE_TASK_FAILED`, `GENERATE_AUDIO_FAILED`, `CALLBACK_EXCEPTION` or `SENSITIVE_WORD_ERROR`.
- Each request returns 2 tracks. Files are kept for about 14 days, so download the ones you want to keep.
- API error codes: 400 bad params, 401 bad key, 405/430 rate limited, 413 text too long, 429 out of credits, 455 maintenance, 500 server error.

## Project layout

```
public/            index.html, styles.css, app.js   (the UI)
netlify/lib/       suno.mjs                         (shared API helper, reads SUNO_API_KEY)
netlify/functions/ generate, status, lyrics, credits, callback
netlify.toml       Netlify build config
```
