import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DOCUMENT_TITLE,
  NOT_FOUND_DOCUMENT_TITLE,
  promoDocumentTitle,
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
