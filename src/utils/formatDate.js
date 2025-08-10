export const formatDate = (dateString) => {
  if (
    dateString === null ||
    dateString === undefined ||
    typeof dateString !== 'string' ||
    dateString.trim() === ''
  ) {
    return '';
  }
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}
