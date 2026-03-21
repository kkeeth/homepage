// RSS feed fetching and parsing utilities
import { formatDate } from '@/utils/formatDate';
import { truncateText } from '@/utils/truncateText';
import { sanitizeHtml } from '@/utils/sanitize';

export interface Episode {
  title: string;
  description: string;
  fullDescription: string;
  /** 表示用フォーマット済み日付 (例: "2025年2月10日") */
  pubDate: string;
  /** ソート用 Date オブジェクト */
  pubDateObj: Date;
  link: string;
  audioUrl: string;
  imageUrl: string;
  imageClass: string;
  duration: string;
  season: string;
  episodeNum: string;
  isPremium: boolean;
}

function stripHtmlTags(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body.textContent ?? '';
}

export async function fetchRSSFeed(url: string): Promise<Episode[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.status}`);
    }
    const text = await response.text();
    return parseRSSFeed(text);
  } catch (error) {
    console.error('Error fetching RSS feed:', error);
    throw error;
  }
}

export function parseRSSFeed(xmlText: string): Episode[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  const items = xmlDoc.querySelectorAll('item');
  const episodes: Episode[] = [];

  items.forEach((item) => {
    const title = item.querySelector('title')?.textContent?.trim() ?? '';
    const rawDescription =
      item.querySelector('description')?.textContent?.trim() ?? '';
    const description = stripHtmlTags(rawDescription);
    const pubDate = item.querySelector('pubDate')?.textContent?.trim() ?? '';
    const linkEl = item.querySelector('link');
    const link = linkEl?.textContent?.trim() || linkEl?.getAttribute('href')?.trim() || '';
    const enclosure = item.querySelector('enclosure');
    const audioUrl = enclosure?.getAttribute('url') ?? '';

    // Get iTunes image
    const itunesImage = item.querySelector('itunes\\:image, image[href]');
    const imageUrl = itunesImage?.getAttribute('href') ?? '';

    // Extract duration if available
    const itunesDuration =
      item.querySelector('itunes\\:duration, duration')?.textContent?.trim() ?? '';

    // Extract season and episode number from iTunes tags
    const itunesSeason =
      item.querySelector('itunes\\:season, season')?.textContent?.trim() ?? '';
    const itunesEpisode =
      item.querySelector('itunes\\:episode, episode')?.textContent?.trim() ?? '';

    episodes.push({
      title,
      description: truncateText(description, 120),
      fullDescription: sanitizeHtml(rawDescription),
      pubDate: formatDate(pubDate),
      pubDateObj: new Date(pubDate),
      link,
      audioUrl,
      imageUrl,
      imageClass: 'mint',
      duration: itunesDuration,
      season: itunesSeason,
      episodeNum: itunesEpisode,
      isPremium: false,
    });
  });

  // Sort by publication date (newest first)
  episodes.sort((a, b) => b.pubDateObj.getTime() - a.pubDateObj.getTime());

  return episodes;
}

export function getLatestEpisodes(episodes: Episode[], count = 6): Episode[] {
  return episodes.slice(0, count);
}

export function getRandomEpisodes(episodes: Episode[], count = 3): Episode[] {
  const shuffled = [...episodes].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Primary Feed と Premium Feed をマージして時系列でソートする。
 * premiumEpisodesPromise が未指定または失敗時は Primary のみで継続。
 */
export async function fetchMergedFeeds(
  primaryUrl: string,
  premiumEpisodesPromise?: Promise<Episode[]>,
): Promise<Episode[]> {
  const primaryPromise = fetchRSSFeed(primaryUrl);

  if (!premiumEpisodesPromise) {
    return primaryPromise;
  }

  const [primary, premium] = await Promise.allSettled([
    primaryPromise,
    premiumEpisodesPromise,
  ]);

  const primaryEpisodes = primary.status === 'fulfilled' ? primary.value : [];
  const premiumEpisodes = premium.status === 'fulfilled' ? premium.value : [];

  return [...primaryEpisodes, ...premiumEpisodes].sort(
    (a, b) => b.pubDateObj.getTime() - a.pubDateObj.getTime(),
  );
}
