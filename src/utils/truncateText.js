export const truncateText = (text, limit) => {
  if (text.length <= limit) return text;
  return text.substring(0, limit).trim() + '...';
}