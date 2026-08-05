export const SITE_NAME = 'For Promotional Use Only';
export const SITE_ORIGIN = 'https://for-promotional-use-only.com';
export const DEFAULT_DOCUMENT_TITLE = SITE_NAME;
export const NOT_FOUND_DOCUMENT_TITLE = `Not found · ${SITE_NAME}`;

const SEARCH_QUERY_MAX = 40;

/**
 * Build the browser tab title for a letter browse or search view.
 *
 * Args:
 *   letter (string|null|undefined): Active letter (A–Z or NUM), when known.
 *   searchQuery (string, default: ''): Current search box value.
 *
 * Returns:
 *   string: Document title for document.title.
 */
export const promoDocumentTitle = (letter, searchQuery = '') => {
  const query = String(searchQuery || '').trim();
  if (query) {
    const truncated =
      query.length > SEARCH_QUERY_MAX
        ? `${query.slice(0, SEARCH_QUERY_MAX)}…`
        : query;
    return `Search: ${truncated} · ${SITE_NAME}`;
  }
  if (letter === 'NUM') {
    return `# mixtapes · ${SITE_NAME}`;
  }
  if (letter) {
    return `${letter} mixtapes · ${SITE_NAME}`;
  }
  return DEFAULT_DOCUMENT_TITLE;
};

/**
 * Absolute canonical URL for a path on the promo origin.
 *
 * Args:
 *   pathname (string): Route path (e.g. ``/k``, ``/num``, ``/``).
 *
 * Returns:
 *   string: Absolute https URL with no trailing slash except for home.
 */
export const canonicalHrefForPath = (pathname) => {
  const raw = String(pathname || '/');
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  if (withSlash === '/' || withSlash === '') {
    return `${SITE_ORIGIN}/`;
  }
  return `${SITE_ORIGIN}${withSlash.replace(/\/+$/, '')}`;
};

/**
 * Ensure ``link[rel=canonical]`` points at the given path (self-referencing).
 *
 * Avoids a static root-only canonical on SPA letter routes that are also
 * listed in sitemap.xml.
 *
 * Args:
 *   pathname (string): Current route path.
 */
export const setDocumentCanonical = (pathname) => {
  if (typeof document === 'undefined') {
    return;
  }
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', canonicalHrefForPath(pathname));
};
