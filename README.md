# Goodday

A diet and fitness tracker/assistant built for Cloudflare Workers. It pairs a responsive chat-first wellness dashboard with Workers AI (Llama 3.3) and D1-backed meal, movement, pantry, goals, and recent conversation state.

## What it does

- Logs meals and snacks with calories, protein, carbohydrates, fat, and fiber, and tracks daily totals against editable, optional guides.
- Logs movement, estimated calorie burn, duration/details, and muscle groups.
- Groups recent meal and movement entries by day and summarizes logged days, meals, calories, protein, and sessions across the last 30 days.
- Saves pantry ingredients and asks the assistant for recipe ideas and a shopping list.
- Provides a wellness chat and workout suggestions grounded in today's logged entries and pantry.
- Keeps a randomly generated browser profile ID, entries, pantry, goals, and recent chat history in D1.

Nutrition and activity values are user-entered or AI-generated estimates. This is a general wellness tool, not medical advice. The MVP does not include authentication: the browser-generated profile ID is an identifier, not a secure login. Add Cloudflare Access or another authentication mechanism and enforce verified user identity before using this for sensitive or production data.

## Run locally

1. Install Node.js, then run `npm install`.
2. Create a D1 database and update `database_id` in `wrangler.toml`:

   ```sh
   npx wrangler d1 create goodday-tracker
   ```

3. Apply the schema locally and start the Worker:

   ```sh
   npx wrangler d1 migrations apply goodday-tracker --local
   npm run dev
   ```

Workers AI must be available to your Cloudflare account. The application uses `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Local development proxies the AI binding to Cloudflare, so authenticate Wrangler (`npx wrangler login`) or configure `CLOUDFLARE_API_TOKEN` before starting `wrangler dev`.

## Deploy

```sh
npx wrangler d1 migrations apply goodday-tracker --remote
npm run deploy
```

The Worker serves the static app in `public/` and handles same-origin `/api/*` requests. D1 bindings and the Workers AI binding are configured in `wrangler.toml`.
