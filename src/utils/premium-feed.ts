import { auth } from '@/services/firebase';
import { parseRSSFeed, type Episode } from '@/utils/rss';
import authStore from '@/stores/auth-store';

const WORKER_BASE_URL = import.meta.env.VITE_WORKER_BASE_URL || '';

export async function fetchPremiumEpisodes(): Promise<Episode[]> {
  if (!WORKER_BASE_URL) return [];

  await authStore.ready();

  const user = auth.currentUser;

  let xml: string;

  if (user) {
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`${WORKER_BASE_URL}/episodes`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        xml = await res.text();
        const episodes = parseRSSFeed(xml);
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

  xml = await res.text();
  const episodes = parseRSSFeed(xml);
  return episodes.map((ep) => ({ ...ep, isPremium: true }));
}
