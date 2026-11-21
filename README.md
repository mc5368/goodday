# Goodday

Goodday is a demo diet and fitness tracker/assistant built to demonstrate Cloudflare application functionality. It runs locally with Wrangler and local D1, and is **not currently deployed as a public or production application**. The project shows how a Cloudflare Worker can serve a browser app, expose authenticated APIs, persist user data, and call Workers AI. Its configuration can be extended to connect to additional deployed Cloudflare products when you choose to provision and configure them.

The Worker API is organized under `src/routes/`, with shared request and profile helpers in `src/lib/`. Browser application code lives in `src/client/` as TypeScript and is bundled into `public/app.js`.

## Cloudflare functionality demonstrated

- **Workers** handle same-origin API requests and serve the browser app from the configured static assets directory.
- **D1** stores accounts, sessions, food and movement entries, goals, fitness profiles, pantry ingredients, and recent chat history.
- **Workers AI** runs Llama 3.3 for nutrition and exercise estimates and for the chat coach's responses and requested log actions.
- **Wrangler local development** provides a local Worker and local D1 database for trying the application without first deploying it or creating a remote D1 database.

The current app does not require Cloudflare Workflows, Durable Objects, Pages, or Realtime. They could be integrated later for needs such as durable multi-step tasks, real-time voice experiences, or other deployment architectures.

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

Run the local startup script to create three demo accounts along with the sample data. Sign in through the app with username `demo1` and password `GooddayDemo2026-1!`. These are development-only credentials; do not seed them into a production database. New accounts currently have no email verification or password-recovery flow, so add those (and consider Cloudflare Access or MFA) before using the app for production or sensitive data. Keep all profile details optional and only enter information you are comfortable storing.

## Run locally

1. Install Node.js, then install dependencies:

   ```sh
   npm install
   ```

2. Start the local Worker. The local dev script applies migrations, inserts demo data without overwriting existing entries, and builds the browser bundle:

   ```sh
   npm run dev:local
   ```

   Open `http://127.0.0.1:8788` and sign in with one of the local demo accounts, for example `demo1` / `GooddayDemo2026-1!`. `npm run dev` also prepares the local database before starting Wrangler. You can safely rerun `npm run db:seed:local`; it does not overwrite existing sample entries or pantry changes.

The app's D1 data is local, but its Workers AI binding is configured as remote. To use AI features locally, Workers AI must be available to your Cloudflare account and Wrangler must be authenticated (`npx wrangler login`) or have a `CLOUDFLARE_API_TOKEN` configured. AI requests reach your Cloudflare account and may incur usage charges. The application uses `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.

Run the API unit tests and TypeScript check with:

```sh
npm test
npm run typecheck
```

## Optional Cloudflare deployment

The project is not deployed by default. To create your own deployment, provision a remote D1 database, replace the placeholder `database_id` in `wrangler.toml`, configure and apply the remote migrations, and deploy the Worker:

```sh
npx wrangler d1 create goodday-tracker
npx wrangler d1 migrations apply goodday-tracker --remote
npm run deploy
```

Before deploying, review the security and account limitations above, ensure demo seeding is not run against production, and configure production secrets and bindings appropriately. `wrangler.toml` currently configures the D1 and Workers AI bindings; additional Cloudflare services can be added there and wired into the Worker as the project grows.
