import observable, { type ObservableInstance } from '@riotjs/observable';
import { fetchRSSFeed } from '@/utils/rss';

interface RSSEpisode {
  title: string;
  description: string;
  pubDate: string;
  link: string;
  imageUrl?: string;
  duration: string;
  season: string;
  episodeNum: string;
}

const DEFAULT_PAGE_SIZE = 12;

export interface Episode {
  id: number;
  title: string;
  description: string;
  pubDate: string;
  link: string;
  imageUrl: string;
  imageClass: string;
  duration: string;
  season: string;
  episodeNum: string;
}

interface EpisodeStore extends ObservableInstance<unknown> {
  allEpisodes: Episode[];
  displayedEpisodes: Episode[];
  isLoading: boolean;
  isInitialized: boolean;
  currentPage: number;
  pageSize: number;
  loadAllEpisodes(): Promise<void>;
  setPage(page: number, pageSize?: number): void;
  getDisplayedEpisodes(): Episode[];
  getTotalCount(): number;
  getCurrentPage(): number;
  getPageSize(): number;
  getTotalPages(): number;
  getDisplayedCount(): number;
  getIsInitialized(): boolean;
  reset(): void;
}

const episodeStore = observable({
  allEpisodes: [] as Episode[],
  displayedEpisodes: [] as Episode[],
  isLoading: false,
  isInitialized: false,
  currentPage: 1,
  pageSize: DEFAULT_PAGE_SIZE,

  async loadAllEpisodes(this: EpisodeStore): Promise<void> {
    console.log('loadAllEpisodes called, isInitialized:', this.isInitialized);
    if (this.isInitialized) return;

    try {
      const RSS_URL = import.meta.env.VITE_RSS_URL;

      if (!RSS_URL) {
        console.warn('VITE_RSS_URL is not set, using fallback data');
        // Fallback data for testing: 30 items to verify pagination
        const fallback: Episode[] = Array.from({ length: 30 }, (_, i) => ({
          id: i + 1,
          title: `サンプルエピソード ${i + 1}`,
          description: `これはテスト用のサンプルエピソード ${i + 1} です。`,
          pubDate: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
          link: '#',
          imageUrl: '/placeholder.svg?height=200&width=400',
          imageClass:
            i % 3 === 0
              ? 'blue-gradient'
              : i % 3 === 1
                ? 'dark-theme'
                : 'warm-gradient',
          duration: String((30 + i * 2) * 60),
          season: String(Math.floor(i / 10) + 1),
          episodeNum: String((i % 10) + 1),
        })).reverse();
        this.allEpisodes = fallback;
      } else {
        const episodes = await fetchRSSFeed(RSS_URL) as RSSEpisode[];

        this.allEpisodes = episodes.map((episode: RSSEpisode, index: number) => ({
          id: index + 1,
          title: episode.title,
          description: episode.description,
          pubDate: episode.pubDate,
          link: episode.link,
          imageUrl: episode.imageUrl || '/placeholder.svg?height=200&width=400',
          imageClass:
            index === 0
              ? 'blue-gradient'
              : index === 1
                ? 'dark-theme'
                : 'warm-gradient',
          duration: episode.duration,
          season: episode.season,
          episodeNum: episode.episodeNum,
        }));
      }

      // 初期表示はページ1でカット（pageSizeは後から画面側で変更可能）
      this.displayedEpisodes = this.allEpisodes.slice(0, this.pageSize);
      this.isInitialized = true;

      this.trigger('episodes-loaded');
    } catch (error) {
      console.error('Failed to load RSS feed:', error);
      this.trigger('load-error', error);
    }
  },

  setPage(this: EpisodeStore, page: number, pageSize: number = this.pageSize): void {
    if (!this.isInitialized) return;

    const safePageSize = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE);
    const total = this.allEpisodes.length;
    const totalPages = Math.max(1, Math.ceil(total / safePageSize));
    const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);

    const start = (safePage - 1) * safePageSize;
    const end = start + safePageSize;

    this.pageSize = safePageSize;
    this.currentPage = safePage;
    this.displayedEpisodes = this.allEpisodes.slice(start, end);

    this.trigger('episodes-updated');
  },

  getDisplayedEpisodes(this: EpisodeStore): Episode[] {
    return this.displayedEpisodes;
  },

  getTotalCount(this: EpisodeStore): number {
    return this.allEpisodes.length;
  },

  getCurrentPage(this: EpisodeStore): number {
    return this.currentPage;
  },

  getPageSize(this: EpisodeStore): number {
    return this.pageSize;
  },

  getTotalPages(this: EpisodeStore): number {
    const total = this.getTotalCount();
    return Math.max(1, Math.ceil(total / this.pageSize));
  },

  getDisplayedCount(this: EpisodeStore): number {
    return this.displayedEpisodes.length;
  },

  getIsInitialized(this: EpisodeStore): boolean {
    return this.isInitialized;
  },

  reset(this: EpisodeStore): void {
    this.allEpisodes = [];
    this.displayedEpisodes = [];
    this.isLoading = false;
    this.isInitialized = false;
    this.currentPage = 1;
    this.pageSize = DEFAULT_PAGE_SIZE;
  },
}) as unknown as EpisodeStore;

export default episodeStore;
