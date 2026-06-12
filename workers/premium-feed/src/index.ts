/**
 * Premium Audio Proxy Worker
 *
 * RSS フィードのマージは廃止。プレミアム再生はウェブのみ。
 * per-user RSS トークン・KV 認可は削除し、Firebase Auth ID トークンで認証する。
 *
 * Endpoints:
 *   GET /episodes         - Firebase ID トークン認証 → Firestore で isPremium 確認
 *                           → ART19 プレミアムフィードを署名付き音声 URL に書き換えて返却
 *   GET /feed/public      - 認証不要 → ART19 プレミアムフィードのメタデータのみ
 *                           （音声 URL なし、エピソード一覧の "鍵アイコン" 表示用）
 *   GET /audio/:episodeId - HMAC 署名検証 → ART19 音声プロキシ (Range 対応)
 */

interface Env {
  SIGNING_KEY: string;
  ART19_PREMIUM_FEED_URL: string;
  FIREBASE_PROJECT_ID: string;
  DEV_MODE?: string;
}

// ── HMAC helpers ─────────────────────────────────────────────────────────────

async function hmacSign(key: string, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacVerify(key: string, data: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(key, data);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

// ── Firebase Auth helpers ─────────────────────────────────────────────────────

// JWT payload を署名検証なしで展開して uid を取得する。
// 実際の署名検証は Firestore REST API が行うため、ここでは uid 取得のみ。
function getUidFromJwt(token: string): string | null {
  try {
    const b64 = token.split('.')[1];
    if (!b64) return null;
    const base64 = b64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    const uid = payload['sub'] ?? payload['user_id'];
    return typeof uid === 'string' ? uid : null;
  } catch {
    return null;
  }
}

// Firestore REST API にユーザーの ID トークンで直接アクセスする。
// Firestore のセキュリティルール（users/{uid}: 本人のみ読み取り可）が
// トークンの署名を検証し、uid とドキュメントパスの一致を強制する。
async function getIsPremium(uid: string, idToken: string, projectId: string): Promise<boolean> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!res.ok) return false;
  const doc = (await res.json()) as { fields?: Record<string, { stringValue?: string }> };
  return doc.fields?.plan?.stringValue === 'premium';
}

// ── ART19 helpers ─────────────────────────────────────────────────────────────

// alternate feed の enclosure URL 例:
//   https://rss.art19.com/episodes/user/{feedToken}/{uuid}.mp3?rss_browser={signed}
// UUID 部分だけを抽出してエピソード識別子とする
function extractEpisodeId(url: string): string | null {
  return url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i)?.[1] ?? null;
}

function toBase64Url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromBase64Url(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

// ── RSS rewrite ───────────────────────────────────────────────────────────────

async function replaceAsync(
  str: string,
  regex: RegExp,
  asyncFn: (...args: string[]) => Promise<string>,
): Promise<string> {
  const matches: { match: string; index: number; groups: string[] }[] = [];
  const re = new RegExp(regex.source, regex.flags);
  let m: RegExpExecArray | null;
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

// enclosure url を HMAC 署名付き Worker URL に書き換える。
// ART19 の rss_browser トークン付き URL を base64url でラップし HMAC の署名対象に含める。
// これにより url パラメータの差し替え攻撃を防ぐ。
async function rewriteAudioUrls(
  feedXml: string,
  workerBase: string,
  signingKey: string,
): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  return replaceAsync(
    feedXml,
    /<enclosure([^>]*)\surl="([^"]+)"([^>]*)\/?\s*>/gi,
    async (_match, before, audioUrl, after) => {
      const episodeId = extractEpisodeId(audioUrl);
      if (!episodeId) return `<enclosure${before} url="${audioUrl}"${after}/>`;
      const b64Url = toBase64Url(audioUrl);
      const sig = await hmacSign(signingKey, `${episodeId}:${b64Url}:${expires}`);
      const signed = `${workerBase}/audio/${episodeId}?u=${b64Url}&expires=${expires}&sig=${sig}`;
      return `<enclosure${before} url="${signed}"${after}/>`;
    },
  );
}

// ── Audio proxy ───────────────────────────────────────────────────────────────

async function proxyAudio(request: Request, art19Url: string): Promise<Response> {
  const headers = new Headers({ 'User-Agent': 'PremiumFeedProxy/1.0' });
  const range = request.headers.get('Range');
  if (range) headers.set('Range', range);

  const upstream = await fetch(art19Url, { headers });

  const responseHeaders = new Headers();
  for (const h of [
    'Content-Type', 'Content-Length', 'Content-Range',
    'Accept-Ranges', 'ETag', 'Last-Modified', 'Cache-Control',
  ]) {
    const v = upstream.headers.get(h);
    if (v) responseHeaders.set(h, v);
  }
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  responseHeaders.set('Access-Control-Allow-Headers', 'Range');
  responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

// ── ART19 フィード取得 ────────────────────────────────────────────────────────

async function fetchArt19Feed(env: Env): Promise<string | null> {
  try {
    const res = await fetch(env.ART19_PREMIUM_FEED_URL, {
      headers: { 'User-Agent': 'PremiumFeedProxy/1.0' },
    });
    return res.ok ? res.text() : null;
  } catch {
    return null;
  }
}

// ── CORS ──────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Range',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
  'Access-Control-Max-Age': '86400',
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

function corsResponse(body: string | null, status: number, extra?: Record<string, string>): Response {
  return new Response(body, { status, headers: { ...CORS_HEADERS, ...extra } });
}

// ── Router ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204);
    }

    // ── GET /episodes ─────────────────────────────────────────────────────
    // localhost (wrangler dev) の場合は認証スキップ
    // 本番は Firebase ID トークン認証 → isPremium 確認
    if (path === '/episodes') {
      const isLocal = env.DEV_MODE === 'true';
      console.log('[debug] DEV_MODE:', JSON.stringify(env.DEV_MODE), 'isLocal:', isLocal);

      if (!isLocal) {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
          return corsResponse('Unauthorized', 401);
        }
        const idToken = authHeader.slice(7);
        const uid = getUidFromJwt(idToken);
        if (!uid) return corsResponse('Unauthorized', 401);

        const isPremium = await getIsPremium(uid, idToken, env.FIREBASE_PROJECT_ID);
        if (!isPremium) return corsResponse('Forbidden', 403);
      }

      const feedXml = await fetchArt19Feed(env);
      if (!feedXml) return corsResponse('Feed unavailable', 502);

      const workerBase = `${url.protocol}//${url.host}`;
      const rewritten = await rewriteAudioUrls(feedXml, workerBase, env.SIGNING_KEY);

      return corsResponse(rewritten, 200, {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'private, no-store',
      });
    }

    // ── GET /feed/public ──────────────────────────────────────────────────
    // 認証不要、音声 URL なし（エピソード一覧の鍵アイコン表示用）
    if (path === '/feed/public') {
      const feedXml = await fetchArt19Feed(env);
      if (!feedXml) return corsResponse('Feed unavailable', 502);

      const publicFeed = feedXml.replace(/<enclosure[^>]*\/?\s*>/gi, '');
      return corsResponse(publicFeed, 200, {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=600',
      });
    }

    // ── GET /audio/:episodeId ─────────────────────────────────────────────
    // HMAC 署名検証 → ART19 音声プロキシ
    // ?u=<base64url(art19Url)>&expires=<unix>&sig=<hmac(episodeId:u:expires)>
    const audioMatch = path.match(/^\/audio\/([a-f0-9-]+)$/i);
    if (audioMatch) {
      const episodeId = audioMatch[1];
      const sig = url.searchParams.get('sig');
      const expires = url.searchParams.get('expires');
      const b64Url = url.searchParams.get('u');

      if (!sig || !expires || !b64Url) return corsResponse('Missing parameters', 400);
      if (Math.floor(Date.now() / 1000) > parseInt(expires, 10)) {
        return corsResponse('URL expired', 410);
      }
      const valid = await hmacVerify(env.SIGNING_KEY, `${episodeId}:${b64Url}:${expires}`, sig);
      if (!valid) return corsResponse('Invalid signature', 403);

      let art19Url: string;
      try {
        art19Url = fromBase64Url(b64Url);
      } catch {
        return corsResponse('Invalid url parameter', 400);
      }

      return withCors(await proxyAudio(request, art19Url));
    }

    return corsResponse('Not Found', 404);
  },
} satisfies ExportedHandler<Env>;
