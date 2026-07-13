// Substack archive API (非公開 JSON API) からエピソード一覧を取得する。
// 公開 RSS には有料限定エピソードが含まれないため、メンバーシップページの
// 一覧表示にはこちらを使う (audience: "only_paid" でもメタデータは取得できる)。
import { formatDate } from '@/utils/formatDate';
import { truncateText } from '@/utils/truncateText';
import { sanitizeHtml } from '@/utils/sanitize';
import type { Episode } from '@/utils/rss';

interface SubstackArchivePost {
  title?: string;
  type?: string;
  audience?: string;
  post_date?: string;
  canonical_url?: string;
  cover_image?: string;
  podcast_episode_image_url?: string;
  podcast_duration?: number;
  podcast_url?: string | null;
  description?: string;
}

export async function fetchSubstackArchive(url: string): Promise<Episode[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch Substack archive: ${response.status}`);
  }
  const posts = (await response.json()) as SubstackArchivePost[];
  if (!Array.isArray(posts)) {
    throw new Error('Unexpected Substack archive response');
  }

  return posts
    .filter((post) => post.type === 'podcast')
    .map((post): Episode => {
      const description = post.description ?? '';
      return {
        title: post.title ?? '',
        description: truncateText(description, 120),
        fullDescription: sanitizeHtml(description),
        pubDate: formatDate(post.post_date ?? ''),
        pubDateObj: new Date(post.post_date ?? ''),
        link: post.canonical_url ?? '',
        audioUrl: post.podcast_url ?? '',
        imageUrl: post.cover_image || post.podcast_episode_image_url || '',
        imageClass: 'mint',
        duration: post.podcast_duration ? String(Math.round(post.podcast_duration)) : '',
        season: '',
        episodeNum: '',
        isPremium: post.audience === 'only_paid',
      };
    })
    .sort((a, b) => b.pubDateObj.getTime() - a.pubDateObj.getTime());
}
