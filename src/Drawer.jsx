import { useState } from 'react';

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

  const playEntry = (path, { resume }) => (event) => {
    event.stopPropagation();
    setOpen(false);
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
          <span
            className="delete"
            onClick={(event) => {
              event.stopPropagation();
              toggleAddRemoveFavorites(path);
            }}
          >
            <i className="fas fa-times" />
          </span>
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
          <span
            className="delete"
            onClick={(event) => {
              event.stopPropagation();
              removeRecent(path);
            }}
          >
            <i className="fas fa-times" />
          </span>
        </li>
      );
    });
  };

  return (
    <div>
      <div className="star-button">
        <button type="button" className="open-drawer" onClick={() => setOpen(true)}>
          <i className="fas fa-star" />
        </button>
      </div>
      {open ? (
        <div
          className="drawer-backdrop drawer-backdrop-override"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      ) : null}
      <div
        className={
          'drawer-panel drawer-override' + (open ? ' drawer-panel--open' : '')
        }
        aria-hidden={!open}
      >
        <div className="drawer-wrapper">
          <h4>
            <i className="fas fa-star" />
            Favorites
            <button type="button" className="clear-all" onClick={clearFavorites}>
              Clear all
            </button>
          </h4>
          <ol>{renderFavorites()}</ol>
          <h4>
            <i className="fa fa-play" />
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
