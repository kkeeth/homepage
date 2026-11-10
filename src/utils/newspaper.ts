// 新聞風デザインで使う共通ヘルパー
import { fetchRSSFeed, type Episode } from '@/utils/rss';
import { RSS_FEED_URL } from '@/constants/links';

let feedPromise: Promise<Episode[]> | null = null;

/**
 * 題字（ヘッダー）と一面（ホーム）で同じフィードを使うため、取得結果を共有する。
 * 失敗した場合は次回呼び出し時に再取得する。
 */
export function getFeed(): Promise<Episode[]> {
  if (!feedPromise) {
    feedPromise = fetchRSSFeed(RSS_FEED_URL).catch((error) => {
      feedPromise = null;
      throw error;
    });
  }
  return feedPromise;
}

const SEASON_PREFIX = /^Season (\d+)-(\d+)\.\s*/;

export function stripSeasonPrefix(title: string): string {
  return title.replace(SEASON_PREFIX, '');
}

/** "Season 5-19. タイトル" → { season: '5', number: '19' } */
export function parseSeason(
  episode: Pick<Episode, 'title' | 'season' | 'episodeNum'>,
): { season: string; number: string } | null {
  const match = episode.title.match(SEASON_PREFIX);
  if (match) return { season: match[1], number: match[2] };
  if (episode.season && episode.episodeNum) {
    return { season: episode.season, number: episode.episodeNum };
  }
  return null;
}

/** "第5期 第19回" / "S5 #19" */
export function episodeLabel(
  episode: Pick<Episode, 'title' | 'season' | 'episodeNum'>,
  locale: string,
): string {
  const parsed = parseSeason(episode);
  if (!parsed) return '';
  return locale === 'ja'
    ? `第${parsed.season}期 第${parsed.number}回`
    : `S${parsed.season} #${parsed.number}`;
}

/** エピソード ID: リンクの最後のパスセグメント、無ければタイトル（episode-list と同じ規則） */
export function episodeId(episode: Pick<Episode, 'link' | 'title'>): string {
  if (episode.link) {
    try {
      const segments = new URL(episode.link).pathname.split('/').filter(Boolean);
      if (segments.length > 0) return segments[segments.length - 1];
    } catch {
      // 不正な URL はタイトルにフォールバック
    }
  }
  return encodeURIComponent(episode.title);
}

/** "2019" / "33:39" / "0:33:39" → 秒 */
export function durationToSeconds(duration: string): number {
  if (!duration) return 0;
  if (duration.includes(':')) {
    return duration
      .split(':')
      .map(Number)
      .reduce((total, part) => total * 60 + (part || 0), 0);
  }
  return Number.parseInt(duration, 10) || 0;
}

/** 秒 → "33分39秒" / "33m 39s" */
export function formatDurationLong(duration: string, locale: string): string {
  const total = durationToSeconds(duration);
  if (!total) return '';
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return locale === 'ja'
    ? `${minutes}分${String(seconds).padStart(2, '0')}秒`
    : `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/** 秒 → "33:39"（再生欄の時刻表示用） */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** 題字上段の日付欄 */
export function editionDate(locale: string, now = new Date()) {
  if (locale === 'ja') {
    const western = new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(now);
    const era = new Intl.DateTimeFormat('ja-JP-u-ca-japanese', {
      era: 'long',
      year: 'numeric',
    }).format(now);
    const weekday = new Intl.DateTimeFormat('ja-JP', {
      weekday: 'long',
    }).format(now);
    return { date: `${western}（${era}）`, weekday };
  }
  // 英字紙の日付欄: "TOKYO, TUESDAY, NOVEMBER 10, 2026"（大文字化は CSS 側）
  return {
    date: new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(now),
    weekday: '',
  };
}

/** 5 → "V"（英字紙の "VOL. CLXXV" 表記用） */
export function toRoman(value: number): string {
  if (!Number.isInteger(value) || value <= 0) return String(value);
  const table: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let rest = value;
  let result = '';
  for (const [num, sym] of table) {
    while (rest >= num) {
      result += sym;
      rest -= num;
    }
  }
  return result;
}

/** 15 時までは朝刊、それ以降は夕刊 */
export function isMorningEdition(now = new Date()): boolean {
  return now.getHours() < 15;
}

/** 本文の打ち切り位置（参考リンク・連絡先・配信サービスの定型文など） */
const SHOW_NOTES_STOP =
  /^(【参考|【.*コンタクト|【.*お便り|【.*おたより|ではでは|[ー—―-]{3,}|See Privacy Policy)/;
const MAX_BODY_BLOCKS = 6;

/**
 * ショーノート（サニタイズ済み HTML）を一面の記事用に分ける。
 * - deck: 「第N回は、〜お話しました」の要約段落（あればリード文に使う）
 * - body: 要約段落を除いた本文。参考リンク以降の定型部分は省く
 */
export function splitShowNotes(html: string): { deck: string; body: string } {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  const blocks = Array.from(doc.body.children);
  const text = (el: Element) => (el.textContent ?? '').trim();

  const deckEl = blocks.find((el) => /お話し/.test(text(el)) && text(el).length < 300);
  const kept: string[] = [];
  for (const el of blocks) {
    if (el === deckEl) continue;
    const t = text(el);
    if (SHOW_NOTES_STOP.test(t)) break;
    if (!t) continue;
    kept.push(el.outerHTML);
    if (kept.length >= MAX_BODY_BLOCKS) break;
  }

  return {
    deck: deckEl ? text(deckEl) : '',
    body: kept.length ? kept.join('') : html,
  };
}
