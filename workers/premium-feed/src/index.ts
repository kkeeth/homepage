/**
 * Premium Feed Worker
 *
 * - /feed/:userToken  — per-user RSS feed (rewrite audio URLs to signed Worker URLs)
 * - /audio/:episodeId — proxy audio from Art19 with signed token + KV auth
 */

// ── helpers ──────────────────────────────────────────────────────────

async function hmacSign(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacVerify(key: string, data: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(key, data);
  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

function generateSignedUrl(baseUrl: string, episodeId: string, userToken: string, signature: string, expires: number): string {
  return `${baseUrl}/audio/${episodeId}?userToken=${userToken}&expires=${expires}&sig=${signature}`;
}

// ── RSS rewriting ────────────────────────────────────────────────────

/**
 * Fetch Art19 premium feed, extract enclosure URLs, and rewrite them
 * to signed Worker audio proxy URLs.
 */
async function buildPersonalFeed(feedXml: string, workerBaseUrl: string, userToken: string, signingKey: string): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24h

  // Rewrite enclosure url attributes
  const rewritten = await replaceAsync(
    feedXml,
    /<enclosure([^>]*)\surl="([^"]+)"([^>]*)\/?\s*>/gi,
    async (_match, before, audioUrl, after) => {
      const episodeId = extractEpisodeId(audioUrl);
      if (!episodeId) {
        return `<enclosure${before} url="${audioUrl}"${after}/>`;
      }
      const data = `${episodeId}:${userToken}:${expires}`;
      const sig = await hmacSign(signingKey, data);
      const signedUrl = generateSignedUrl(workerBaseUrl, episodeId, userToken, sig, expires);
      return `<enclosure${before} url="${signedUrl}"${after}/>`;
    },
  );

  return rewritten;
}

/**
 * Extract episode ID from Art19 audio URL.
 * e.g. https://rss.art19.com/episodes/EPISODE-UUID.mp3 → EPISODE-UUID
 */
function extractEpisodeId(url: string): string | null {
  const m = url.match(/episodes\/([a-f0-9-]+)/i);
  return m?.[1] ?? null;
}

/**
 * String.prototype.replace doesn't support async replacers.
 * This helper processes regex matches sequentially with async callbacks.
 */
async function replaceAsync(str: string, regex: RegExp, asyncFn: (...args: string[]) => Promise<string>): Promise<string> {
  const matches: { match: string; index: number; groups: string[] }[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(regex.source, regex.flags);
  while ((m = re.exec(str)) !== null) {
    matches.push({ match: m[0], index: m.index, groups: [...m] });
  }

  let result = '';
  let lastIndex = 0;
  for (const entry of matches) {
    result += str.slice(lastIndex, entry.index);
    result += await asyncFn(...entry.groups);
    lastIndex = entry.index + entry.match.length;
  }
  result += str.slice(lastIndex);
  return result;
}

// ── audio proxy (Art19 → client with Range support) ──────────────────

/**
 * Build the Art19 audio URL from episode ID.
 * Art19 audio URL pattern: https://rss.art19.com/episodes/{episodeId}.mp3
 */
function art19AudioUrl(episodeId: string): string {
  return `https://rss.art19.com/episodes/${episodeId}.mp3`;
}

async function proxyAudio(request: Request, episodeId: string): Promise<Response> {
  const upstreamUrl = art19AudioUrl(episodeId);

  // Forward Range header for seeking / partial downloads
  const headers = new Headers();
  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) {
    headers.set('Range', rangeHeader);
  }
  headers.set('User-Agent', 'PremiumFeedProxy/1.0');

  const upstream = await fetch(upstreamUrl, { headers });

  // Build response headers (pass through content-related headers)
  const responseHeaders = new Headers();
  const passthroughHeaders = ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified', 'Cache-Control'];
  for (const h of passthroughHeaders) {
    const v = upstream.headers.get(h);
    if (v) responseHeaders.set(h, v);
  }

  // CORS for web player
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  responseHeaders.set('Access-Control-Allow-Headers', 'Range');
  responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

  return new Response(upstream.body, {
    status: upstream.status, // 200 or 206
    headers: responseHeaders,
  });
}

// ── main router ──────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range',
          'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // ── /feed/public (メタデータのみ、音声URLなし) ──
    if (path === '/feed/public') {
      return handlePublicFeed(env);
    }

    // ── /feed/:userToken ──
    const feedMatch = path.match(/^\/feed\/([a-zA-Z0-9_-]+)$/);
    if (feedMatch) {
      return handleFeed(request, env, ctx, feedMatch[1]);
    }

    // ── /audio/:episodeId ──
    const audioMatch = path.match(/^\/audio\/([a-f0-9-]+)$/i);
    if (audioMatch) {
      return handleAudio(request, env, audioMatch[1], url.searchParams);
    }

    return new Response('Not Found', {
      status: 404,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  },
} satisfies ExportedHandler<Env>;

// ── /feed/public handler (メタデータのみ、認証不要) ───────────────────

async function handlePublicFeed(env: Env): Promise<Response> {
  const feedUrl = env.ART19_PREMIUM_FEED_URL;
  if (!feedUrl) {
    return new Response('Feed not configured', {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  let feedXml: string;
  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': 'PremiumFeedProxy/1.0' },
    });
    if (!res.ok) {
      return new Response(`Upstream feed error: ${res.status}`, {
        status: 502,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }
    feedXml = await res.text();
  } catch {
    return new Response('Failed to fetch upstream feed', {
      status: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  // 音声URLを除去（enclosure タグを削除）
  const publicFeed = feedXml.replace(/<enclosure[^>]*\/?\s*>/gi, '');

  return new Response(publicFeed, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ── /feed/:userToken handler ─────────────────────────────────────────

async function handleFeed(request: Request, env: Env, ctx: ExecutionContext, userToken: string): Promise<Response> {
  // Check subscription in KV
  const status = await env.SUBSCRIBERS.get(userToken);
  if (status !== 'active') {
    return new Response('Unauthorized: invalid or expired subscription', {
      status: 401,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  const feedUrl = env.ART19_PREMIUM_FEED_URL;
  if (!feedUrl) {
    return new Response('Feed not configured', {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Fetch Art19 premium feed
  let feedXml: string;
  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': 'PremiumFeedProxy/1.0' },
    });
    if (!res.ok) {
      return new Response(`Upstream feed error: ${res.status}`, {
        status: 502,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }
    feedXml = await res.text();
  } catch {
    return new Response('Failed to fetch upstream feed', {
      status: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Rewrite enclosure URLs
  const workerBaseUrl = new URL(request.url).origin;
  const personalFeed = await buildPersonalFeed(feedXml, workerBaseUrl, userToken, env.SIGNING_KEY);

  return new Response(personalFeed, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'private, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ── /audio/:episodeId handler ────────────────────────────────────────

async function handleAudio(request: Request, env: Env, episodeId: string, params: URLSearchParams): Promise<Response> {
  const userToken = params.get('userToken');
  const expires = params.get('expires');
  const sig = params.get('sig');

  if (!userToken || !expires || !sig) {
    return new Response('Missing authentication parameters', {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Check expiration
  const expiresNum = parseInt(expires, 10);
  if (isNaN(expiresNum) || Math.floor(Date.now() / 1000) > expiresNum) {
    return new Response('Token expired', {
      status: 403,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Verify HMAC signature
  const data = `${episodeId}:${userToken}:${expires}`;
  const valid = await hmacVerify(env.SIGNING_KEY, data, sig);
  if (!valid) {
    return new Response('Invalid signature', {
      status: 403,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Check subscription in KV (real-time revocation)
  const status = await env.SUBSCRIBERS.get(userToken);
  if (status !== 'active') {
    return new Response('Subscription inactive', {
      status: 403,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Proxy audio from Art19
  return proxyAudio(request, episodeId);
}
