// RSS feed fetching and parsing utilities
import { formatDate } from '@/utils/formatDate';
import { truncateText } from '@/utils/truncateText';

function stripHtmlTags(html) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  return tempDiv.textContent || tempDiv.innerText || '';
}

export async function fetchRSSFeed(url) {
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

export function parseRSSFeed(xmlText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  const items = xmlDoc.querySelectorAll('item');
  const episodes = [];

  items.forEach(item => {
    const title = item.querySelector('title')?.textContent?.trim() || '';
    const rawDescription = item.querySelector('description')?.textContent?.trim() || '';
    const description = stripHtmlTags(rawDescription);
    const pubDate = item.querySelector('pubDate')?.textContent?.trim() || '';
    const link = item.querySelector('link')?.textContent?.trim() || '';
    const enclosure = item.querySelector('enclosure');
    const audioUrl = enclosure?.getAttribute('url') || '';

    // Get iTunes image
    const itunesImage = item.querySelector('itunes\\:image, image[href]');
    const imageUrl = itunesImage?.getAttribute('href') || '';

    // Extract duration if available
    const itunesDuration = item.querySelector('itunes\\:duration, duration')?.textContent?.trim() || '';

    episodes.push({
      title,
      description: truncateText(description, 120),
      pubDate: formatDate(new Date(pubDate)),
      link,
      audioUrl,
      imageUrl,
      imageClass: "mint",
      duration: itunesDuration
    });
  });

  // Sort by publication date (newest first)
  episodes.sort((a, b) => b.pubDateObj - a.pubDateObj);

  return episodes;
}

export function getLatestEpisodes(episodes, count = 6) {
  return episodes.slice(0, count);
}

export function getRandomEpisodes(episodes, count = 3) {
  const shuffled = [...episodes].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}