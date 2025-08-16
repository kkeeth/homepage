// ポッドキャスト配信プラットフォーム
export const PODCAST_PLATFORMS = {
  SPOTIFY: 'https://open.spotify.com/show/4ZqUQtob7eJrz9DQV7lPVd',
  APPLE_PODCASTS: 'https://podcasts.apple.com/jp/podcast/雨宿りとwebの小噺-fm/id1516699977',
  YOUTUBE_MUSIC: 'https://music.youtube.com/playlist?list=PLVncrZRHU7RjSBziqoUGmfsyM41SY_l4u',
  AMAZON_MUSIC: 'https://music.amazon.co.jp/podcasts/1ea89476-2b4f-4ba4-8260-57ed5ef45df5',
  RSS_FEED: 'https://rss.art19.com/kkeethengineers'
};

// ソーシャルメディアリンク
export const SOCIAL_LINKS = {
  TWITTER: 'https://x.com/kuwahara_jsri',
  GITHUB: 'https://github.com/kkeeth',
  SUBSTACK: 'https://kkeeth.substack.com',
  EMAIL: 'mailto:zensin0082@gmail.com'
};

// プラットフォーム情報（アイコン名とURL）
export const PLATFORM_CONFIG = [
  {
    name: 'twitter',
    icon: 'twitter-x',
    url: SOCIAL_LINKS.TWITTER,
    label: 'Twitter'
  },
  {
    name: 'github',
    icon: 'github',
    url: SOCIAL_LINKS.GITHUB,
    label: 'GitHub'
  },
  {
    name: 'spotify',
    icon: 'spotify',
    url: PODCAST_PLATFORMS.SPOTIFY,
    label: 'Spotify'
  },
  {
    name: 'apple',
    icon: 'apple',
    url: PODCAST_PLATFORMS.APPLE_PODCASTS,
    label: 'Apple Podcasts'
  },
  {
    name: 'youtube',
    icon: 'youtube',
    url: PODCAST_PLATFORMS.YOUTUBE_MUSIC,
    label: 'YouTube Music'
  },
  {
    name: 'amazon',
    icon: 'amazon',
    url: PODCAST_PLATFORMS.AMAZON_MUSIC,
    label: 'Amazon Music'
  },
  {
    name: 'substack',
    icon: 'substack',
    url: SOCIAL_LINKS.SUBSTACK,
    label: 'Substack'
  },
  {
    name: 'email',
    icon: 'envelope-fill',
    url: SOCIAL_LINKS.EMAIL,
    label: 'Email'
  }
];

// プラットフォーム配信用の設定（homeページ用）
export const HOME_PLATFORMS = [
  {
    name: 'Apple Podcasts',
    icon: 'apple',
    url: PODCAST_PLATFORMS.APPLE_PODCASTS
  },
  {
    name: 'Spotify',
    icon: 'spotify',
    url: PODCAST_PLATFORMS.SPOTIFY
  },
  {
    name: 'Amazon Music',
    icon: 'amazon',
    url: PODCAST_PLATFORMS.AMAZON_MUSIC
  },
  {
    name: 'YouTube Music',
    icon: 'youtube',
    url: PODCAST_PLATFORMS.YOUTUBE_MUSIC
  },
  {
    name: 'RSS Feed',
    icon: 'rss',
    url: PODCAST_PLATFORMS.RSS_FEED
  }
];

// その他の番組情報
export const OTHER_PROGRAMS = [
  {
    id: 1,
    title: "余談ですが.fm",
    description: "デザインやアートのこと、創作の楽しさを語る番組",
    episodes: 264,
    category: "雑談",
    artworkUrl: "/images/yodan.png",
    schedule: "不定期",
    listen: {
      spotify: "https://open.spotify.com/show/4ZqUQtob7eJrz9DQV7lPVd?si=954ae47964264af4",
      apple: "",
      amazon: "",
      rss: "https://rss.listen.style/p/yodan-desu-ga/rss"
    }
  },
  {
    id: 2,
    title: "むらかみはるキッチン.fm",
    description: "世田谷線沿いに住む二人が、村上春樹について話したりする番組",
    episodes: 36,
    category: "文学",
    artworkUrl: "/images/murakami.png",
    schedule: "不定期",
    listen: {
      spotify: "https://open.spotify.com/show/1vCXwpGaZHjoyx2neFBFAp?si=954ae47964264af4",
      apple: "",
      amazon: "",
      rss: "https://rss.listen.style/p/murakamiharu-kitchen/rss"
    }
  },
  {
    id: 3,
    title: "KIAI.fm",
    description: "リモートワークでも気合いを入れ続けたい人たちの日常を語る番組",
    episodes: 9,
    category: "雑談",
    artworkUrl: "/images/kiai.png",
    schedule: "不定期",
    listen: {
      spotify: "https://open.spotify.com/show/1vCXwpGaZHjoyx2neFBFAp?si=954ae47964264af4",
      apple: "",
      amazon: "",
      rss: "https://rss.listen.style/p/kiai/rss"
    }
  },
  {
    id: 4,
    title: "そうそう、それそれ",
    description: "聞けば聞くほど分からなくなる、何の番組か説明できない番組",
    episodes: 11,
    category: "雑談",
    artworkUrl: "/images/sousouresore.png",
    schedule: "不定期",
    listen: {
      spotify: "https://open.spotify.com/show/1vCXwpGaZHjoyx2neFBFAp?si=954ae47964264af4",
      apple: "",
      amazon: "",
      rss: "https://rss.listen.style/p/sousou-soresore/rss"
    }
  },
  {
    id: 5,
    title: "染まりんさんな",
    description: "東京に染まってしまった３人が広島の霊を取り戻す番組",
    episodes: 7,
    category: "雑談",
    artworkUrl: "/images/somarinsanna.avif",
    schedule: "不定期",
    listen: {
      spotify: "https://open.spotify.com/show/1vCXwpGaZHjoyx2neFBFAp?si=954ae47964264af4",
      apple: "",
      amazon: "",
      rss: "https://rss.listen.style/p/somarinsanna/rss"
    }
  }
];