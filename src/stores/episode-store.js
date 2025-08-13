import observable from '@riotjs/observable';
import { fetchRSSFeed } from '@/utils/rss';

const DEFAULT_PAGE_SIZE = 12;

const episodeStore = observable({
  allEpisodes: [],
  displayedEpisodes: [],
  isLoading: false,
  isInitialized: false,
  currentPage: 1,
  pageSize: DEFAULT_PAGE_SIZE,

  async loadAllEpisodes() {
    console.log('loadAllEpisodes called, isInitialized:', this.isInitialized);
    if (this.isInitialized) return;

    try {
      const RSS_URL = import.meta.env.VITE_RSS_URL;
      console.log('RSS_URL:', RSS_URL);

      if (!RSS_URL) {
        console.warn('VITE_RSS_URL is not set, using fallback data');
        // Fallback data for testing: 30 items to verify pagination
        this.allEpisodes = Array.from({ length: 30 }, (_, i) => ({
          id: i + 1,
          title: `サンプルエピソード ${i + 1}`,
          description: `これはテスト用のサンプルエピソード ${i + 1} です。`,
          pubDate: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
          link: "#",
          imageUrl: "/placeholder.svg?height=200&width=400",
          imageClass: (i % 3 === 0) ? "blue-gradient" : (i % 3 === 1) ? "dark-theme" : "warm-gradient"
        })).reverse();
      } else {
        const episodes = await fetchRSSFeed(RSS_URL);
        console.log('Fetched episodes:', episodes.length);

        this.allEpisodes = episodes.map((episode, index) => ({
          id: index + 1,
          title: episode.title,
          description: episode.description,
          pubDate: episode.pubDate,
          link: episode.link,
          imageUrl: episode.imageUrl || "/placeholder.svg?height=200&width=400",
          imageClass: index === 0 ? "blue-gradient" : index === 1 ? "dark-theme" : "warm-gradient"
        }));
      }

      // 初期表示はページ1でカット（pageSizeは後から画面側で変更可能）
      this.displayedEpisodes = this.allEpisodes.slice(0, this.pageSize);
      this.isInitialized = true;

      console.log('Triggering episodes-loaded, displayedEpisodes:', this.displayedEpisodes.length);
      this.trigger('episodes-loaded');
    } catch (error) {
      console.error('Failed to load RSS feed:', error);
      this.trigger('load-error', error);
    }
  },

  setPage(page, pageSize = this.pageSize) {
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

  getDisplayedEpisodes() {
    return this.displayedEpisodes;
  },

  getTotalCount() {
    return this.allEpisodes.length;
  },

  getCurrentPage() {
    return this.currentPage;
  },

  getPageSize() {
    return this.pageSize;
  },

  getTotalPages() {
    const total = this.getTotalCount();
    return Math.max(1, Math.ceil(total / this.pageSize));
  },

  getDisplayedCount() {
    return this.displayedEpisodes.length;
  },

  reset() {
    this.allEpisodes = [];
    this.displayedEpisodes = [];
    this.isLoading = false;
    this.isInitialized = false;
    this.currentPage = 1;
    this.pageSize = DEFAULT_PAGE_SIZE;
  }
});

export default episodeStore;