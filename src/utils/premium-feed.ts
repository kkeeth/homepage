/**
 * Premium feed client utility.
 * Fetches premium episodes from the Cloudflare Worker's /feed/:userToken endpoint.
 * The Worker returns RSS XML with signed audio URLs.
 */
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/services/firebase';
import { parseRSSFeed, type Episode } from '@/utils/rss';

const WORKER_BASE_URL = import.meta.env.VITE_WORKER_BASE_URL || '';

export async function fetchPremiumEpisodes(): Promise<Episode[]> {
  if (!WORKER_BASE_URL) return [];

  const user = auth.currentUser;
  if (!user) return [];

  // Get userToken from Firestore
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  const userToken = userDoc.data()?.premiumFeedToken;
  if (!userToken) return [];

  // Fetch premium feed from Worker (RSS XML with signed audio URLs)
  const response = await fetch(`${WORKER_BASE_URL}/feed/${userToken}`);
  if (!response.ok) return [];

  const xml = await response.text();
  const episodes = parseRSSFeed(xml);

  // Mark all episodes as premium (they come from the premium feed)
  return episodes.map((ep) => ({ ...ep, isPremium: true }));
}
