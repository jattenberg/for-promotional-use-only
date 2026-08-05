import { useCallback, useEffect, useRef, useState } from 'react';
import { createSearchTracker, getEventLogger } from './events';
import {
  buildNavigationOrder,
  letterForSongKey,
  letterToRoute,
  parseLetterPayload,
  prepareSongForDisplay,
  resumeSeekSeconds,
} from './songUtils';

const STATE_KEY = 'state.v2';
const RECENTS_CAP = 50;
const assetBase = import.meta.env.BASE_URL || '/';

const loadPersistedState = () => {
  const saved = localStorage.getItem(STATE_KEY);
  if (!saved) {
    return { favorites: {}, recentlyPlayed: {} };
  }
  try {
    const parsed = JSON.parse(saved);
    return {
      favorites: parsed.favorites || {},
      recentlyPlayed: parsed.recentlyPlayed || {},
    };
  } catch {
    return { favorites: {}, recentlyPlayed: {} };
  }
};

/**
 * App state, catalog loading, playback orchestration, and drawer/search helpers.
 *
 * Args:
 *   routeLetter (string): Normalized letter from the URL (A–Z or NUM).
 *   options.navigate (function, optional): Override for react-router navigate (tests).
 */
export function usePromoApp(routeLetter, navigate) {
  const persisted = loadPersistedState();

  const [activeLetter, setActiveLetter] = useState(routeLetter);
  const [songList, setSongList] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [favorites, setFavorites] = useState(persisted.favorites);
  const [recentlyPlayed, setRecentlyPlayed] = useState(persisted.recentlyPlayed);
  const [pendingPlay, setPendingPlay] = useState(null);
  const [currentlyPlayingPath, setCurrentlyPlayingPath] = useState(null);
  const [seekToSeconds, setSeekToSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(null);
  const [searchIndexError, setSearchIndexError] = useState(null);
  const [searchIndexLoading, setSearchIndexLoading] = useState(false);
  const [catalogPaths, setCatalogPaths] = useState([]);

  const fetchGeneration = useRef(0);
  const searchIndexPromise = useRef(null);
  const catalogIndexPromise = useRef(null);
  const pendingPlayRef = useRef(pendingPlay);
  pendingPlayRef.current = pendingPlay;
  const events = useRef(getEventLogger());
  const trackSearch = useRef(
    createSearchTracker((name, props, path) => events.current.track(name, props, path))
  );

  useEffect(() => {
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({ favorites, recentlyPlayed })
    );
  }, [favorites, recentlyPlayed]);

  useEffect(() => {
    if (!routeLetter) {
      return;
    }
    events.current.track(
      'page_view',
      { letter: routeLetter },
      '/' + letterToRoute(routeLetter)
    );
  }, [routeLetter]);

  const loadLetter = useCallback((letter) => {
    const generation = fetchGeneration.current + 1;
    fetchGeneration.current = generation;
    setLoading(true);
    setError(null);
    setActiveLetter(letter);
    setSearchQuery('');

    fetch(`${assetBase}json/${letter}songs.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${letter} songs (${response.status})`);
        }
        return response.json();
      })
      .then((songListJson) => {
        if (fetchGeneration.current !== generation) {
          return;
        }
        const { tracks, albums: letterAlbums } = parseLetterPayload(songListJson);
        const pending = pendingPlayRef.current;
        const orphanPending =
          pending && pending.path && tracks.indexOf(pending.path) === -1;
        const applyPending =
          pending && pending.path && tracks.indexOf(pending.path) !== -1;

        setSongList(tracks);
        setAlbums(letterAlbums);
        setLoading(false);
        setError(null);
        if (orphanPending) {
          setPendingPlay(null);
        }
        if (applyPending) {
          setCurrentlyPlayingPath(pending.path);
          setSeekToSeconds(
            typeof pending.seekTo === 'number' && pending.seekTo > 0 ? pending.seekTo : 0
          );
          setPendingPlay(null);
        }
      })
      .catch((err) => {
        if (fetchGeneration.current !== generation) {
          return;
        }
        setLoading(false);
        setError(err.message || 'Failed to load songs');
      });
  }, []);

  const ensureCatalogPaths = useCallback(() => {
    if (catalogPaths.length) {
      return Promise.resolve(catalogPaths);
    }
    if (catalogIndexPromise.current) {
      return catalogIndexPromise.current;
    }
    catalogIndexPromise.current = fetch(`${assetBase}json/index.json`)
      .then((response) => (response.ok ? response.json() : []))
      .then((index) => {
        if (!Array.isArray(index)) {
          return [];
        }
        const paths = index.map((entry) => entry.path).filter(Boolean);
        setCatalogPaths(paths);
        return paths;
      })
      .catch(() => [])
      .finally(() => {
        catalogIndexPromise.current = null;
      });
    return catalogIndexPromise.current;
  }, [catalogPaths]);

  useEffect(() => {
    ensureCatalogPaths();
  }, [ensureCatalogPaths]);

  useEffect(() => {
    if (routeLetter) {
      loadLetter(routeLetter);
    }
  }, [routeLetter, loadLetter]);

  const retryLoad = useCallback(() => {
    loadLetter(activeLetter);
  }, [activeLetter, loadLetter]);

  const toggleAddRemoveFavorites = useCallback((songPath) => {
    setFavorites((prev) => {
      const removing = songPath in prev;
      events.current.track(
        removing ? 'favorite_remove' : 'favorite_add',
        { song_path: songPath },
        typeof location !== 'undefined' ? location.pathname : '/'
      );
      if (removing) {
        return Object.keys(prev)
          .filter((path) => path !== songPath)
          .reduce((acc, path) => ({ ...acc, [path]: prev[path] }), {});
      }
      return {
        ...prev,
        [songPath]: {
          title: prepareSongForDisplay(songPath),
          at: Date.now(),
        },
      };
    });
  }, []);

  const deleteAllFaves = useCallback(() => {
    setFavorites({});
  }, []);

  const deleteAllRecents = useCallback(() => {
    setRecentlyPlayed({});
  }, []);

  const recordPlayed = useCallback((songPath) => {
    setRecentlyPlayed((prev) => {
      const at = Date.now();
      const previous = prev[songPath] || {};
      const withoutCurrent = Object.keys(prev)
        .filter((path) => path !== songPath)
        .reduce((acc, path) => ({ ...acc, [path]: prev[path] }), {});

      const recentlyPlayed = {
        [songPath]: {
          title: prepareSongForDisplay(songPath),
          at,
          positionSeconds:
            typeof previous.positionSeconds === 'number' ? previous.positionSeconds : 0,
          durationSeconds:
            typeof previous.durationSeconds === 'number' ? previous.durationSeconds : null,
        },
        ...withoutCurrent,
      };

      return Object.keys(recentlyPlayed)
        .slice(0, RECENTS_CAP)
        .reduce((acc, path) => ({ ...acc, [path]: recentlyPlayed[path] }), {});
    });
  }, []);

  const updatePlaybackPosition = useCallback((songPath, positionSeconds, durationSeconds) => {
    setRecentlyPlayed((prev) => {
      const existing = prev[songPath];
      if (!existing) {
        return prev;
      }
      const nextPosition = Number(positionSeconds);
      const nextDuration = Number(durationSeconds);
      const position = Number.isFinite(nextPosition) && nextPosition >= 0 ? nextPosition : 0;
      const duration =
        Number.isFinite(nextDuration) && nextDuration > 0 ? nextDuration : null;

      const previousPosition = Number(existing.positionSeconds) || 0;
      if (position < 1 && previousPosition > 5) {
        return prev;
      }
      if (existing.positionSeconds === position && existing.durationSeconds === duration) {
        return prev;
      }
      return {
        ...prev,
        [songPath]: {
          ...existing,
          positionSeconds: position,
          durationSeconds: duration,
          at: Date.now(),
        },
      };
    });
  }, []);

  const removeRecent = useCallback((songPath) => {
    setRecentlyPlayed((prev) =>
      Object.keys(prev)
        .filter((path) => path !== songPath)
        .reduce((acc, path) => ({ ...acc, [path]: prev[path] }), {})
    );
  }, []);

  const seekForPath = useCallback(
    (songPath, { resume }) => {
      if (!resume) {
        return 0;
      }
      const recent = recentlyPlayed[songPath];
      if (!recent) {
        return 0;
      }
      return resumeSeekSeconds(recent.positionSeconds, recent.durationSeconds);
    },
    [recentlyPlayed]
  );

  const playMixtape = useCallback(
    (songPath, { resume } = { resume: false }) => {
      if (!songPath) {
        return;
      }
      const letter = letterForSongKey(songPath);
      const seekTo = seekForPath(songPath, { resume: !!resume });
      const nextPending = { path: songPath, seekTo };
      const deferred = {
        pendingPlay: nextPending,
        currentlyPlayingPath: null,
        seekToSeconds: 0,
      };

      if (routeLetter !== letter) {
        setPendingPlay(nextPending);
        setCurrentlyPlayingPath(null);
        setSeekToSeconds(0);
        navigate('/' + letterToRoute(letter));
        return;
      }

      if (songList.indexOf(songPath) === -1) {
        setPendingPlay(nextPending);
        setCurrentlyPlayingPath(null);
        setSeekToSeconds(0);
        return;
      }

      setCurrentlyPlayingPath(songPath);
      setSeekToSeconds(seekTo);
      setPendingPlay(null);
    },
    [navigate, routeLetter, seekForPath, songList]
  );

  const selectTrack = useCallback(
    (songPath) => {
      if (!songPath || currentlyPlayingPath === songPath) {
        return;
      }
      setCurrentlyPlayingPath(songPath);
      setSeekToSeconds(0);
    },
    [currentlyPlayingPath]
  );

  const clearPlayback = useCallback(() => {
    setCurrentlyPlayingPath(null);
    setSeekToSeconds(0);
  }, []);

  const clearSeek = useCallback(() => {
    setSeekToSeconds((prev) => (prev ? 0 : prev));
  }, []);

  const navigationSongList = useCallback(
    () => buildNavigationOrder(songList, albums),
    [songList, albums]
  );

  const playAdjacentTrack = useCallback(
    (offset) => {
      const letterOrder = navigationSongList();
      if (!letterOrder.length && offset > 0 && !currentlyPlayingPath) {
        clearPlayback();
        return;
      }

      if (!currentlyPlayingPath && offset > 0) {
        setCurrentlyPlayingPath(letterOrder[0]);
        setSeekToSeconds(0);
        return;
      }

      if (!currentlyPlayingPath) {
        return;
      }

      const letterIndex = letterOrder.indexOf(currentlyPlayingPath);

      if (offset > 0) {
        if (letterIndex >= 0 && letterIndex < letterOrder.length - 1) {
          setCurrentlyPlayingPath(letterOrder[letterIndex + 1]);
          setSeekToSeconds(0);
          return;
        }

        ensureCatalogPaths().then((catalogOrder) => {
          if (!catalogOrder.length) {
            clearPlayback();
            return;
          }
          const catalogIndex = catalogOrder.indexOf(currentlyPlayingPath);
          if (catalogIndex >= 0 && catalogIndex < catalogOrder.length - 1) {
            playMixtape(catalogOrder[catalogIndex + 1]);
            return;
          }
          clearPlayback();
        });
        return;
      }

      if (letterIndex > 0) {
        setCurrentlyPlayingPath(letterOrder[letterIndex - 1]);
        setSeekToSeconds(0);
        return;
      }

      clearPlayback();
    },
    [
      clearPlayback,
      currentlyPlayingPath,
      ensureCatalogPaths,
      navigationSongList,
      playMixtape,
    ]
  );

  const playNextTrack = useCallback(() => playAdjacentTrack(1), [playAdjacentTrack]);
  const playPreviousTrack = useCallback(() => playAdjacentTrack(-1), [playAdjacentTrack]);

  const ensureSearchIndex = useCallback(() => {
    if (searchIndex || searchIndexError || searchIndexPromise.current) {
      return;
    }
    setSearchIndexLoading(true);
    searchIndexPromise.current = fetch(`${assetBase}json/index.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Search index unavailable (${response.status})`);
        }
        return response.json();
      })
      .then((index) => {
        setSearchIndex(index);
        setSearchIndexLoading(false);
        setSearchIndexError(null);
      })
      .catch((err) => {
        setSearchIndexLoading(false);
        setSearchIndexError(err.message || 'Search unavailable');
        searchIndexPromise.current = null;
      });
  }, [searchIndex, searchIndexError]);

  const handleSearchChange = useCallback((event) => {
    const value = event.target.value;
    setSearchQuery(value);
    trackSearch.current(
      value,
      typeof location !== 'undefined' ? location.pathname : '/'
    );
  }, []);

  const jumpToLetter = useCallback(
    (letter) => {
      navigate('/' + letterToRoute(letter));
    },
    [navigate]
  );

  const searchResults = useCallback(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || !searchIndex) {
      return [];
    }
    return searchIndex
      .map((entry) => ({
        ...entry,
        title: prepareSongForDisplay(entry.path),
      }))
      .filter((entry) => entry.title.toLowerCase().indexOf(query) !== -1)
      .slice(0, 50);
  }, [searchIndex, searchQuery]);

  return {
    activeLetter,
    songList,
    albums,
    favorites,
    recentlyPlayed,
    pendingPlay,
    currentlyPlayingPath,
    seekToSeconds,
    loading,
    error,
    searchQuery,
    searchIndexError,
    searchIndexLoading,
    retryLoad,
    toggleAddRemoveFavorites,
    deleteAllFaves,
    deleteAllRecents,
    removeRecent,
    playMixtape,
    selectTrack,
    clearSeek,
    playNextTrack,
    playPreviousTrack,
    recordPlayed,
    updatePlaybackPosition,
    ensureSearchIndex,
    handleSearchChange,
    jumpToLetter,
    searchResults,
  };
}
