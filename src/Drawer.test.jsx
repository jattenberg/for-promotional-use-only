import { render, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import Drawer from './Drawer';
import { createFocusTrapKeyDown, getFocusableElements } from './focusTrap';

const favorites = {
  'mixtape/alpha.mp3': { title: 'Alpha', at: 1 },
};
const recentlyPlayed = {
  'mixtape/bravo.mp3': { title: 'Bravo', at: 2 },
};

const renderDrawer = (props = {}) =>
  render(
    <Drawer
      favorites={favorites}
      recentlyPlayed={recentlyPlayed}
      deleteAllFaves={vi.fn()}
      deleteAllRecents={vi.fn()}
      toggleAddRemoveFavorites={vi.fn()}
      removeRecent={vi.fn()}
      onPlayMixtape={vi.fn()}
      {...props}
    />
  );

describe('focusTrap helpers', () => {
  it('wraps Tab from last focusable back to first', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <button type="button">First</button>
      <button type="button">Second</button>
    `;
    document.body.appendChild(root);

    const [first, second] = getFocusableElements(root);
    second.focus();

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    createFocusTrapKeyDown(root)(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    root.remove();
  });
});

describe('Drawer focus management', () => {
  let confirmSpy;

  beforeEach(() => {
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it('moves focus into the drawer when opened and restores on Escape', () => {
    renderDrawer();

    const opener = screen.getByRole('button', {
      name: 'Open favorites and recently played',
    });
    opener.focus();
    expect(document.activeElement).toBe(opener);

    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog', {
      name: 'Favorites and recently played',
    });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-hidden')).not.toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(document.activeElement).toBe(opener);
    expect(dialog.getAttribute('aria-hidden')).toBe('true');
  });

  it('traps Tab cycles inside the open drawer', () => {
    renderDrawer();

    fireEvent.click(
      screen.getByRole('button', { name: 'Open favorites and recently played' })
    );

    const dialog = screen.getByRole('dialog', {
      name: 'Favorites and recently played',
    });
    const focusable = getFocusableElements(dialog);
    expect(focusable.length).toBeGreaterThan(1);

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('keeps clear-all confirms keyboard-reachable', () => {
    const deleteAllFaves = vi.fn();
    renderDrawer({ deleteAllFaves });

    fireEvent.click(
      screen.getByRole('button', { name: 'Open favorites and recently played' })
    );

    const dialog = screen.getByRole('dialog', {
      name: 'Favorites and recently played',
    });
    const clearFavorites = within(dialog).getAllByRole('button', {
      name: 'Clear all',
    })[0];

    clearFavorites.focus();
    expect(document.activeElement).toBe(clearFavorites);
    fireEvent.click(clearFavorites);

    expect(confirmSpy).toHaveBeenCalledWith('Clear all favorites?');
    expect(deleteAllFaves).toHaveBeenCalled();
  });
});
