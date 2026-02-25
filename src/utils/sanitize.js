// HTML sanitization utility
import DOMPurify from 'dompurify';

/**
 * Sanitizes HTML content to prevent XSS attacks
 * @param {string} html - The HTML string to sanitize
 * @returns {string} - The sanitized HTML string
 */
export function sanitizeHtml(html) {
  if (!html) return '';

  // Configure DOMPurify to allow common HTML tags for RSS feed descriptions
  // but remove dangerous attributes and scripts.
  // RETURN_DOM: true で DOM を直接受け取り、外部リンク処理をここで完結させる。
  // グローバルフック (addHook/removeHooks) を使わないことで、他モジュールの
  // フックを誤って削除するリスクをなくしている。
  const body = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li',
      'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'span', 'div'
    ],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    // Use safe templates to prevent attribute-based attacks
    SAFE_FOR_TEMPLATES: true,
    // Restrict URLs to safe protocols and anchors only
    // RSS feeds typically contain absolute URLs, not relative paths
    ALLOWED_URI_REGEXP: /^(?:(?:https?):\/\/|mailto:|tel:|#)/i,
    RETURN_DOM: true,
  });

  // 外部リンクに target="_blank" と rel を付与
  body.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (href.startsWith('http://') || href.startsWith('https://')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });

  return body.innerHTML;
}
