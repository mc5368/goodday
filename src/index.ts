import { handleApi } from "./routes";
import { json } from "./lib/http";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    return handleApi(request, env);
  },
} satisfies ExportedHandler<Env>;
