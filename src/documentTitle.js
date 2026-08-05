export const SITE_NAME = 'For Promotional Use Only';
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
