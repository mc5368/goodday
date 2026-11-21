# Goodday

A diet and fitness tracker/assistant built for Cloudflare Workers. It pairs a responsive chat-first wellness dashboard with Workers AI (Llama 3.3) and D1-backed meal, movement, pantry, goals, and recent conversation state.

The Worker API is organized under `src/routes/` with shared request and profile helpers in `src/lib/`. Browser application code lives in `src/client/` as TypeScript and is bundled to `public/app.js` by the build step.

## What it does

- Logs meals and snacks with calories, protein, carbohydrates, fat, and fiber, and tracks daily totals against editable, optional guides.
- Logs movement, estimated calorie burn, duration/details, and muscle groups.
- Groups recent meal and movement entries by day and summarizes logged days, meals, calories, protein, and sessions across the last 30 days.
- Saves pantry ingredients and asks the assistant for recipe ideas and a shopping list.
- Provides a wellness chat and workout suggestions grounded in today's logged entries and pantry.
- Lets users explicitly ask the chat coach to log a meal or exercise; the entry is saved only after the AI action and database write succeed.
- Uses Workers AI to estimate meal calories and nutrients or workout calories and muscle groups; suggestions are editable before logging.
- Supports browser voice dictation and spoken assistant replies where the browser provides Web Speech APIs.
- Keeps a browser profile ID, entries, pantry, goals, and recent chat history in D1.
- Seeds three repeatable local demo profiles with varied 30-day food and movement logs when starting local development.

Nutrition and activity values are user-entered or AI-generated estimates. Review estimates before saving; exercise calorie estimates vary by person. Voice dictation may send audio through the browser's speech-recognition service, while spoken replies use browser speech synthesis. This is a general wellness tool, not medical advice. The MVP does not include authentication: the browser-generated profile ID is an identifier, not a secure login. Add Cloudflare Access or another authentication mechanism and enforce verified user identity before using this for sensitive or production data.

## Run locally

1. Install Node.js, then run `npm install`.
2. Create a D1 database and update `database_id` in `wrangler.toml`:

   ```sh
   npx wrangler d1 create goodday-tracker
   ```

3. Start the local Worker. The local dev scripts apply migrations, insert demo data without duplicates, and build the browser bundle:

   ```sh
   npm run dev:local
   ```

   Open `http://127.0.0.1:8788` and use the local-only profile selector in the header to switch among the three sample users. `npm run dev` also seeds the local D1 database before starting Wrangler. The seed can be safely re-run with `npm run db:seed:local`; it does not overwrite existing sample entries or pantry changes.

Workers AI must be available to your Cloudflare account. The application uses `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. The AI binding is remote during local development, so authenticate Wrangler (`npx wrangler login`) or configure `CLOUDFLARE_API_TOKEN` before using AI features locally. Local AI requests reach your Cloudflare account and may incur usage charges.

## Deploy

```sh
npx wrangler d1 migrations apply goodday-tracker --remote
npm run deploy
```

The Worker serves the static app in `public/` and handles same-origin `/api/*` requests. D1 bindings and the Workers AI binding are configured in `wrangler.toml`.
