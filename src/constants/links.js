// ソーシャルメディアリンク
export const SOCIAL_LINKS = [
  {
    name: '𝕏',
    icon: 'twitter-x',
    url: 'https://x.com/kuwahara_jsri',
    label: '𝕏',
  },
  {
    name: 'github',
    icon: 'github',
    url: 'https://github.com/kkeeth',
    label: 'GitHub',
  },
  {
    name: 'linkedin',
    icon: 'linkedin',
    url: 'https://www.linkedin.com/in/kkeeth/',
    label: 'LinkedIn',
  },
  {
    name: 'email',
    icon: 'envelope-fill',
    url: 'mailto:zensin0082@gmail.com',
    label: 'Email',
  },
];

// プラットフォーム配信用
export const PODCAST_PLATFORMS = [
  {
    name: 'Apple Podcasts',
    icon: 'apple',
    url: 'https://podcasts.apple.com/jp/podcast/雨宿りとwebの小噺-fm/id1516699977',
  },
  {
    name: 'Spotify',
    icon: 'spotify',
    url: 'https://open.spotify.com/show/4ZqUQtob7eJrz9DQV7lPVd',
  },
  {
    name: 'Amazon Music',
    icon: 'amazon',
    url: 'https://music.amazon.co.jp/podcasts/1ea89476-2b4f-4ba4-8260-57ed5ef45df5',
  },
  {
    name: 'YouTube Music',
    icon: 'youtube',
    url: 'https://music.youtube.com/channel/UCvHAm_PHmXM5bCOT4Bv4yBg',
  },
  {
    name: 'RSS Feed',
    icon: 'rss',
    url: 'https://rss.art19.com/kkeethengineers',
  },
];

// 自分のスキルセット
export const MY_SKILLS = [
  'Riot.js',
  'React',
  'Node.js',
  'TypeScript',
  'Podcasting',
  'Recruiting Support',
  'Personal Coaching',
  'Programming Education',
];

// その他の番組情報
export const OTHER_PROGRAMS = [
  {
    id: 1,
    title: '余談ですが.fm',
    description: 'デザインやアートのこと、創作の楽しさを語る番組',
    episodes: 264,
    category: '雑談',
    artworkUrl: '/images/yodan.png',
    schedule: '不定期',
    listen: {
      spotify:
        'https://open.spotify.com/show/4ZqUQtob7eJrz9DQV7lPVd?si=954ae47964264af4',
      apple: '',
      amazon: '',
      rss: 'https://rss.listen.style/p/yodan-desu-ga/rss',
    },
  },
  {
    id: 2,
    title: 'Keethの声日記',
    description: '声による日々の日記',
    episodes: 83,
    category: 'ライフ',
    artworkUrl: '/images/daily.png',
    schedule: '不定期',
    listen: {
      spotify:
        'https://open.spotify.com/show/0BmrSZm67MRT6nd2qqXMTd?si=a35693154e914b14',
      apple:
        'https://podcasts.apple.com/jp/podcast/keeth%E3%81%AE%E5%A3%B0%E6%97%A5%E8%A8%98/id1772090936',
      amazon:
        'https://music.amazon.co.jp/podcasts/8c0ce814-31d3-4c65-9940-da0fb0c7fed7/keeth%E3%81%AE%E5%A3%B0%E6%97%A5%E8%A8%98',
      rss: 'https://rss.listen.style/p/keeth-daily/rss',
    },
  },
  {
    id: 3,
    title: '好きの寄り道ラジオ',
    description: '好きなものを熱く語る番組',
    episodes: 3,
    category: '雑談',
    artworkUrl: '/images/sukiyori.png',
    schedule: '不定期',
    listen: {
      spotify:
        'https://open.spotify.com/show/1KSoDQWaSayrTBHvZZMjnm?si=1ab90adaaf5d4137',
      apple:
        'https://podcasts.apple.com/us/podcast/%E5%A5%BD%E3%81%8D%E3%81%AE%E5%AF%84%E3%82%8A%E9%81%93%E3%83%A9%E3%82%B8%E3%82%AA/id1772087350',
      amazon:
        'https://music.amazon.co.jp/podcasts/bb834182-f53f-4010-b112-c1f7ede76bbc/%E5%A5%BD%E3%81%8D%E3%81%AE%E5%AF%84%E3%82%8A%E9%81%93%E3%83%A9%E3%82%B8%E3%82%AA',
      rss: 'https://rss.listen.style/p/sukiyori/rss',
    },
  },
  {
    id: 4,
    title: '徒然なるままに頭の中を吐き出す',
    description: 'タイトル通りの番組',
    episodes: 24,
    category: '思考',
    artworkUrl: '/images/any_talk.png',
    schedule: '不定期',
    listen: {
      spotify:
        'https://open.spotify.com/show/72YBoURXl1LxtWhSeCdQPO?si=9a2cdcf40431441f',
      apple:
        'https://podcasts.apple.com/jp/podcast/%E5%BE%92%E7%84%B6%E3%81%AA%E3%82%8B%E3%81%BE%E3%81%BE%E3%81%AB%E9%A0%AD%E3%81%AE%E4%B8%AD%E3%82%92%E5%90%90%E3%81%8D%E5%87%BA%E3%81%99%E5%A0%B4/id1784637944',
      amazon: '',
      rss: 'https://api.substack.com/feed/podcast/3447681.rss',
    },
  },
  {
    id: 5,
    title: '染まりんさんな',
    description: '東京に染まってしまった３人が広島の霊を取り戻す番組',
    episodes: 7,
    category: '雑談',
    artworkUrl: '/images/somarinsanna.avif',
    schedule: '不定期',
    listen: {
      spotify:
        'https://open.spotify.com/show/1vCXwpGaZHjoyx2neFBFAp?si=954ae47964264af4',
      apple: '',
      amazon: '',
      rss: 'https://rss.listen.style/p/somarinsanna/rss',
    },
  },
];
