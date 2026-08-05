import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DOCUMENT_TITLE,
  NOT_FOUND_DOCUMENT_TITLE,
  SITE_ORIGIN,
  canonicalHrefForPath,
  promoDocumentTitle,
  setDocumentCanonical,
} from './documentTitle';

describe('promoDocumentTitle', () => {
  it('titles letter browse views', () => {
    expect(promoDocumentTitle('K')).toBe('K mixtapes · For Promotional Use Only');
    expect(promoDocumentTitle('NUM')).toBe('# mixtapes · For Promotional Use Only');
  });

  it('prefers an active search query over the letter', () => {
    expect(promoDocumentTitle('K', '  jungle  ')).toBe(
      'Search: jungle · For Promotional Use Only'
    );
  });

  it('truncates long search queries', () => {
    const long = 'a'.repeat(45);
    expect(promoDocumentTitle('K', long)).toBe(
      `Search: ${'a'.repeat(40)}… · For Promotional Use Only`
    );
  });

  it('falls back to the site name without a letter', () => {
    expect(promoDocumentTitle(null)).toBe(DEFAULT_DOCUMENT_TITLE);
    expect(NOT_FOUND_DOCUMENT_TITLE).toBe('Not found · For Promotional Use Only');
  });
});

describe('canonicalHrefForPath', () => {
  it('self-references letter routes instead of collapsing to home', () => {
    expect(canonicalHrefForPath('/')).toBe(`${SITE_ORIGIN}/`);
    expect(canonicalHrefForPath('/k')).toBe(`${SITE_ORIGIN}/k`);
    expect(canonicalHrefForPath('/num')).toBe(`${SITE_ORIGIN}/num`);
    expect(canonicalHrefForPath('/a/')).toBe(`${SITE_ORIGIN}/a`);
  });
});

describe('setDocumentCanonical', () => {
  afterEach(() => {
    document.querySelectorAll('link[rel="canonical"]').forEach((node) => node.remove());
  });

  it('writes a self-referencing canonical link into the document head', () => {
    setDocumentCanonical('/k');
    const link = document.querySelector('link[rel="canonical"]');
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe(`${SITE_ORIGIN}/k`);

    setDocumentCanonical('/num');
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(link.getAttribute('href')).toBe(`${SITE_ORIGIN}/num`);
  });
});
