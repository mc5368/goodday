# Goodday

A diet and fitness tracker/assistant built for Cloudflare Workers. It pairs a responsive chat-first wellness dashboard with Workers AI (Llama 3.3) and D1-backed meal, movement, pantry, goals, and recent conversation state.

The Worker API is organized under `src/routes/` with shared request and profile helpers in `src/lib/`. Browser application code lives in `src/client/` as TypeScript and is bundled to `public/app.js` by the build step.

## What it does

- Logs meals and snacks with calories, protein, carbohydrates, fat, and fiber, and tracks daily totals against editable, optional guides.
- Logs movement, estimated calorie burn, duration/details, and muscle groups.
- Groups recent meal and movement entries by day and summarizes logged days, meals, calories, protein, and sessions across the last 30 days.
- Shows progress charts for calories, macros, fiber, movement sessions, and movement calories over 7-day, 30-day, 90-day, and yearly ranges.
- Offers an optional fitness profile for goals, age, gender identity, activity level, training experience, target events, limitations, equipment, and preferred activities; the coach uses it to tailor suggestions.
- Saves pantry ingredients and asks the assistant for recipe ideas and a shopping list.
- Provides a wellness chat and workout suggestions grounded in today's logged entries and pantry.
- Lets users explicitly ask the chat coach to log a meal or exercise; the entry is saved only after the AI action and database write succeed.
- Uses Workers AI to estimate meal calories and nutrients or workout calories and muscle groups; suggestions are editable before logging.
- Supports browser voice dictation and spoken assistant replies where the browser provides Web Speech APIs.
- Keeps each signed-in account's entries, pantry, goals, fitness profile, and recent chat history in D1.
- Seeds three repeatable local demo accounts with varied 30-day food and movement logs when starting local development.
- Provides username/password registration and sign-in, with a persistent 30-day secure session cookie.

Nutrition and activity values are user-entered or AI-generated estimates. Review estimates before saving; exercise calorie estimates vary by person. Voice dictation may send audio through the browser's speech-recognition service, while spoken replies use browser speech synthesis. This is a general wellness tool, not medical advice.

Fitness profile fields are optional and editable. Gender identity is used only for respectful wording, not to infer physiology. The coach avoids weight-loss and restrictive-diet advice for users under 18. Profile information is stored in D1 alongside the user's other tracker data. A muscle-group body diagram is deferred as a future design enhancement; the Movement view currently shows a text summary instead.

## Accounts and data protection

Users can create an account with a unique username and a password of at least 12 characters. Passwords are never stored in readable or reversibly encrypted form: the Worker stores a per-account random salt and a PBKDF2-HMAC-SHA-256 hash (600,000 iterations). The Worker redirects production HTTP requests to HTTPS and enables HSTS; the opaque, random session token is delivered in a `Secure`, `HttpOnly`, `SameSite=Strict` cookie, while only its SHA-256 hash is stored in D1. Sessions expire after 30 days, and failed sign-ins and account creation are rate-limited. Protected API routes use the signed-in account identity from the server session, not a browser-supplied profile ID.

Run the local startup script to create three demo accounts along with the sample data. For example, sign in with username `demo1` and password `GooddayDemo2026-1!`. These are development-only credentials; do not seed them into a production database. New accounts currently have no email verification or password-recovery flow, so add those (and consider Cloudflare Access or MFA) before using the app for production or sensitive data. Keep all profile details optional and only enter information you are comfortable storing.

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
