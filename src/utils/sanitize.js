// HTML sanitization utility
import DOMPurify from 'dompurify';

// Remove any existing hooks to prevent duplicates in case of module reloading
DOMPurify.removeHooks('afterSanitizeAttributes');

// Configure hook once at module initialization to avoid duplicate hooks
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    const href = node.getAttribute('href');
    // Only add target="_blank" and rel for external URLs (http/https)
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  }
});

/**
 * Sanitizes HTML content to prevent XSS attacks
 * @param {string} html - The HTML string to sanitize
 * @returns {string} - The sanitized HTML string
 */
export function sanitizeHtml(html) {
  if (!html) return '';
  
  // Configure DOMPurify to allow common HTML tags for RSS feed descriptions
  // but remove dangerous attributes and scripts
  const config = {
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
  };
  
  return DOMPurify.sanitize(html, config);
}
