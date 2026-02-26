export function truncateText(text: string, limit = 120): string {
  if (text.length <= limit) return text;
  return text.substring(0, limit).trim() + '...';
}
