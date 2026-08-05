import { render, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import AlphabetMenu from './AlphabetMenu';
import { letterFromRoute } from './songUtils';

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="path">{location.pathname}</div>;
};

const AlphabetRoute = () => {
  const location = useLocation();
  const letter = letterFromRoute(location.pathname.replace(/^\//, '')) || 'K';
  return (
    <>
      <AlphabetMenu activeLetter={letter} />
      <LocationProbe />
    </>
  );
};

const renderAlphabet = (initialPath = '/k') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/:letter" element={<AlphabetRoute />} />
      </Routes>
    </MemoryRouter>
  );

describe('AlphabetMenu accessibility', () => {
  it('exposes letter links and marks the active letter for AT', () => {
    renderAlphabet('/k');

    const active = screen.getByRole('link', { name: 'K' });
    expect(active.getAttribute('aria-current')).toBe('page');
    expect(
      screen.getByRole('navigation', { name: 'Browse by letter' })
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Numbers and symbols' }).textContent
    ).toBe('#');
  });

  it('navigates when a focused letter is activated with Enter', () => {
    renderAlphabet('/k');

    const letterA = screen.getByRole('link', { name: 'A' });
    letterA.focus();
    expect(document.activeElement).toBe(letterA);

    fireEvent.keyDown(letterA, { key: 'Enter', code: 'Enter', charCode: 13 });
    fireEvent.click(letterA);

    expect(screen.getByTestId('path').textContent).toBe('/a');
    expect(
      screen.getByRole('link', { name: 'A' }).getAttribute('aria-current')
    ).toBe('page');
  });

  it('navigates NUM/# the same way as A–Z', () => {
    renderAlphabet('/k');

    const num = screen.getByRole('link', { name: 'Numbers and symbols' });
    num.focus();
    fireEvent.keyDown(num, { key: 'Enter', code: 'Enter', charCode: 13 });
    fireEvent.click(num);

    expect(screen.getByTestId('path').textContent).toBe('/num');
    expect(num.getAttribute('aria-current')).toBe('page');
  });
});
