export const truncateText = (text, limit = 120) => {
  if (text.length <= limit) return text;
  return text.substring(0, limit).trim() + '...';
}