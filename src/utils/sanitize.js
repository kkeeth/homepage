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
  // but remove dangerous attributes and scripts
  const config = {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li',
      'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'span', 'div', 'img'
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    // Use safe templates to prevent attribute-based attacks
    SAFE_FOR_TEMPLATES: true,
    // Restrict URLs to safe protocols only
    ALLOWED_URI_REGEXP: /^(?:(?:https?|ftp):\/\/|mailto:|tel:|#)/i,
  };
  
  // Add a hook to ensure all external links have rel="noopener noreferrer"
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      if (node.hasAttribute('target')) {
        node.setAttribute('rel', 'noopener noreferrer');
      }
      // Ensure external links always open in new tab safely
      if (node.hasAttribute('href') && !node.getAttribute('href').startsWith('#')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
  });
  
  return DOMPurify.sanitize(html, config);
}
