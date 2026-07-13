/**
 * RSS CORS Proxy Worker
 *
 * Substack の RSS フィード・archive API は CORS ヘッダーを返さないため、
 * このワーカーがブラウザ向けに CORS ヘッダーを付与して転送する。
 *
 * Endpoints:
 *   GET /rss      — Substack RSS を CORS 付きで返す
 *   GET /archive  — Substack archive API (JSON) を CORS 付きで返す。
 *                   公開 RSS には載らない有料限定エピソードのメタデータも含まれる。
 */

interface Env {
  SUBSTACK_RSS_URL: string;
  SUBSTACK_ARCHIVE_URL: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const path = new URL(request.url).pathname;

    const routes: Record<string, { url: string; contentType: string }> = {
      '/rss': {
        url: env.SUBSTACK_RSS_URL,
        contentType: 'application/rss+xml; charset=utf-8',
      },
      '/archive': {
        url: env.SUBSTACK_ARCHIVE_URL,
        contentType: 'application/json; charset=utf-8',
      },
    };

    const route = routes[path];
    if (!route) {
      return new Response('Not Found', { status: 404, headers: CORS });
    }

    try {
      const upstream = await fetch(route.url, {
        headers: { 'User-Agent': 'RSSProxy/1.0' },
      });
      if (!upstream.ok) {
        return new Response('Feed unavailable', { status: 502, headers: CORS });
      }
      return new Response(await upstream.text(), {
        headers: {
          ...CORS,
          'Content-Type': route.contentType,
          'Cache-Control': 'public, max-age=600',
        },
      });
    } catch {
      return new Response('Feed unavailable', { status: 502, headers: CORS });
    }
  },
} satisfies ExportedHandler<Env>;
