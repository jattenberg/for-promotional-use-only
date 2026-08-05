import { useEffect, useRef, useState } from 'react';
import { createFocusTrapKeyDown, getFocusableElements } from './focusTrap';

/**
 * Favorites and recently-played drawer (CSS panel, no MUI).
 */
export default function Drawer({
  favorites,
  deleteAllFaves,
  deleteAllRecents,
  recentlyPlayed,
  toggleAddRemoveFavorites,
  removeRecent,
  onPlayMixtape,
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const openerRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  const closeDrawer = () => setOpen(false);
  const openDrawer = () => setOpen(true);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return undefined;
    }
    if (open) {
      panel.removeAttribute('inert');
    } else {
      panel.setAttribute('inert', '');
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : openerRef.current;

    const panel = panelRef.current;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
        return;
      }
      createFocusTrapKeyDown(panel)(event);
    };

    document.addEventListener('keydown', onKeyDown);

    const focusable = getFocusableElements(panel);
    const initialTarget = focusable[0] || panel;
    if (initialTarget && typeof initialTarget.focus === 'function') {
      initialTarget.focus();
    }

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const previous = previouslyFocusedRef.current || openerRef.current;
      if (previous && typeof previous.focus === 'function') {
        previous.focus();
      }
    };
  }, [open]);

  const playEntry = (path, { resume }) => (event) => {
    event.stopPropagation();
    closeDrawer();
    if (onPlayMixtape) {
      onPlayMixtape(path, { resume });
    }
  };

  const clearFavorites = (event) => {
    event.stopPropagation();
    if (window.confirm('Clear all favorites?')) {
      deleteAllFaves();
    }
  };

  const clearRecents = (event) => {
    event.stopPropagation();
    if (window.confirm('Clear all recently played?')) {
      deleteAllRecents();
    }
  };

  const renderFavorites = () => {
    if (Object.keys(favorites).length < 1) {
      return (
        <p className="default-empty-songs">None yet, start favoriting something!</p>
      );
    }
    return Object.keys(favorites).map((path) => {
      const entry = favorites[path];
      const title = entry && entry.title ? entry.title : path;
      return (
        <li key={path}>
          <button
            type="button"
            className="drawer-play"
            onClick={playEntry(path, { resume: true })}
          >
            {title}
          </button>
          <button
            type="button"
            className="delete"
            aria-label={`Remove ${title} from favorites`}
            onClick={(event) => {
              event.stopPropagation();
              toggleAddRemoveFavorites(path);
            }}
          >
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </li>
      );
    });
  };

  const renderRecentlyPlayed = () => {
    if (Object.keys(recentlyPlayed).length < 1) {
      return (
        <p className="default-empty-songs">None yet, start playing something!</p>
      );
    }
    return Object.keys(recentlyPlayed).map((path) => {
      const entry = recentlyPlayed[path];
      const title = entry && entry.title ? entry.title : path;
      return (
        <li key={path}>
          <button
            type="button"
            className="drawer-play"
            onClick={playEntry(path, { resume: true })}
          >
            {title}
          </button>
          <button
            type="button"
            className="delete"
            aria-label={`Remove ${title} from recently played`}
            onClick={(event) => {
              event.stopPropagation();
              removeRecent(path);
            }}
          >
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </li>
      );
    });
  };

  return (
    <div>
      <div className="star-button">
        <button
          ref={openerRef}
          type="button"
          className="open-drawer"
          aria-label="Open favorites and recently played"
          aria-expanded={open}
          aria-controls="promo-drawer"
          onClick={openDrawer}
        >
          <i className="fas fa-star" aria-hidden="true" />
        </button>
      </div>
      {open ? (
        <div
          className="drawer-backdrop drawer-backdrop-override"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      ) : null}
      <div
        id="promo-drawer"
        ref={panelRef}
        className={
          'drawer-panel drawer-override' + (open ? ' drawer-panel--open' : '')
        }
        role="dialog"
        aria-modal={open ? true : undefined}
        aria-label="Favorites and recently played"
        aria-hidden={!open}
        tabIndex={open ? -1 : undefined}
      >
        <div className="drawer-wrapper">
          <h4>
            <i className="fas fa-star" aria-hidden="true" />
            Favorites
            <button type="button" className="clear-all" onClick={clearFavorites}>
              Clear all
            </button>
          </h4>
          <ol>{renderFavorites()}</ol>
          <h4>
            <i className="fa fa-play" aria-hidden="true" />
            Recently Played
            <button type="button" className="clear-all" onClick={clearRecents}>
              Clear all
            </button>
          </h4>
          <ol>{renderRecentlyPlayed()}</ol>
        </div>
      </div>
    </div>
  );
}
