/**
 * RSS CORS Proxy Worker
 *
 * Substack の RSS フィードは CORS ヘッダーを返さないため、
 * このワーカーがブラウザ向けに CORS ヘッダーを付与して転送する。
 *
 * Endpoint:
 *   GET /rss  — Substack RSS を CORS 付きで返す
 */

interface Env {
  SUBSTACK_RSS_URL: string;
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
    if (path !== '/rss') {
      return new Response('Not Found', { status: 404, headers: CORS });
    }

    try {
      const upstream = await fetch(env.SUBSTACK_RSS_URL, {
        headers: { 'User-Agent': 'RSSProxy/1.0' },
      });
      if (!upstream.ok) {
        return new Response('Feed unavailable', { status: 502, headers: CORS });
      }
      return new Response(await upstream.text(), {
        headers: {
          ...CORS,
          'Content-Type': 'application/rss+xml; charset=utf-8',
          'Cache-Control': 'public, max-age=600',
        },
      });
    } catch {
      return new Response('Feed unavailable', { status: 502, headers: CORS });
    }
  },
} satisfies ExportedHandler<Env>;
