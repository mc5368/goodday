import { handleApi } from "./routes";
import { json } from "./lib/http";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const isLocal = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !isLocal) {
      url.protocol = "https:";
      return Response.redirect(url, 308);
    }

    const response = url.pathname.startsWith("/api/")
      ? await handleApi(request, env)
      : await env.ASSETS.fetch(request);
    if (url.protocol !== "https:") return response;

    const headers = new Headers(response.headers);
    headers.set("strict-transport-security", "max-age=31536000");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
