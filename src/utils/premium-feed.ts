import { auth } from '@/services/firebase';
import { parseRSSFeed, type Episode } from '@/utils/rss';
import authStore from '@/stores/auth-store';

const WORKER_BASE_URL = import.meta.env.VITE_WORKER_BASE_URL || '';
const isDev = import.meta.env.DEV;

export async function fetchPremiumEpisodes(): Promise<Episode[]> {
  if (!WORKER_BASE_URL) {
    if (isDev) {
      console.warn(
        '[premium-feed] VITE_WORKER_BASE_URL が未設定のためプレミアムフィードをスキップ。' +
          'リポジトリ直下に .env.local を作成して VITE_WORKER_BASE_URL=http://localhost:8787 を設定してください',
      );
    }
    return [];
  }

  // ローカル開発: Worker 側の DEV_MODE=true と対になって認証なしで /episodes を叩く
  if (isDev) {
    const res = await fetch(`${WORKER_BASE_URL}/episodes`);
    console.log('[premium-feed] GET', `${WORKER_BASE_URL}/episodes`, '->', res.status);
    if (!res.ok) return [];
    const episodes = parseRSSFeed(await res.text());
    console.log('[premium-feed] parsed episodes:', episodes.length);
    return episodes.map((ep) => ({ ...ep, isPremium: true }));
  }

  await authStore.ready();

  const user = auth.currentUser;

  if (user) {
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`${WORKER_BASE_URL}/episodes`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const episodes = parseRSSFeed(await res.text());
        return episodes.map((ep) => ({ ...ep, isPremium: true }));
      }
      // 403 = not premium, fall through to public feed
      if (res.status !== 403) return [];
    } catch {
      return [];
    }
  }

  // Non-premium or logged-out: metadata-only feed (no audio URLs)
  const res = await fetch(`${WORKER_BASE_URL}/feed/public`);
  if (!res.ok) return [];
  const episodes = parseRSSFeed(await res.text());
  return episodes.map((ep) => ({ ...ep, isPremium: true }));
}
