/**
 * Premium feed client utility.
 * Fetches premium episodes from the Cloudflare Worker's /feed/:userToken endpoint.
 * The Worker returns RSS XML with signed audio URLs.
 */
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/services/firebase';
import { parseRSSFeed, type Episode } from '@/utils/rss';
import authStore from '@/stores/auth-store';

const WORKER_BASE_URL = import.meta.env.VITE_WORKER_BASE_URL || '';

export async function fetchPremiumEpisodes(): Promise<Episode[]> {
  if (!WORKER_BASE_URL) return [];

  // onAuthStateChanged の初回発火を待ってから currentUser を参照する
  await authStore.ready();

  const user = auth.currentUser;

  let feedUrl: string;
  if (user) {
    // ログイン済み: 認証付きフィード（音声URL付き）
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userToken = userDoc.data()?.premiumFeedToken;
    if (!userToken) {
      // トークン未発行でもメタデータは表示する
      feedUrl = `${WORKER_BASE_URL}/feed/public`;
    } else {
      feedUrl = `${WORKER_BASE_URL}/feed/${userToken}`;
    }
  } else {
    // 未ログイン: パブリックフィード（メタデータのみ、音声URLなし）
    feedUrl = `${WORKER_BASE_URL}/feed/public`;
  }

  const response = await fetch(feedUrl);
  if (!response.ok) return [];

  const xml = await response.text();
  const episodes = parseRSSFeed(xml);

  // Mark all episodes as premium (they come from the premium feed)
  return episodes.map((ep) => ({ ...ep, isPremium: true }));
}
