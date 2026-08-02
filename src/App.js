import React, { Component } from 'react';
import AlphabetMenu from './AlphabetMenu';
import Songs from './Songs';
import Drawer from './Drawer';
import BottomPlaybackBar from './BottomPlaybackBar';
import ScrollToTop from 'react-scroll-up';
import NotFound from './NotFound';
import {
  compareSongsForDisplay,
  letterForSongKey,
  letterFromRoute,
  letterToRoute,
  prepareSongForDisplay,
  resumeSeekSeconds,
} from './songUtils';

const STATE_KEY = 'state.v2';
const RECENTS_CAP = 50;

const defaultState = () => ({
  activeLetter: 'K',
  songList: [],
  favorites: {},
  recentlyPlayed: {},
  pendingPlay: null,
  currentlyPlayingPath: null,
  seekToSeconds: 0,
  loading: false,
  error: null,
  searchQuery: '',
  searchIndex: null,
  searchIndexError: null,
  searchIndexLoading: false,
});
const loadPersistedState = () => {
  const saved = localStorage.getItem(STATE_KEY);
  if (!saved) {
    return {};
  }
  try {
    const parsed = JSON.parse(saved);
    return {
      favorites: parsed.favorites || {},
      recentlyPlayed: parsed.recentlyPlayed || {},
    };
  } catch (e) {
    return {};
  }
};

class App extends Component {
  constructor(props) {
    super(props);

    const persisted = loadPersistedState();
    const routeLetter = letterFromRoute(
      props.match && props.match.params && props.match.params.letter
    );

    this.state = {
      ...defaultState(),
      ...persisted,
      activeLetter: routeLetter || 'K',
    };
    this.fetchGeneration = 0;
    this.searchIndexPromise = null;
  }

  componentDidMount() {
    const letter = letterFromRoute(
      this.props.match && this.props.match.params && this.props.match.params.letter
    );
    if (letter) {
      this.loadLetter(letter);
    }
  }

  componentDidUpdate(prevProps, prevState) {
    const prevParam =
      prevProps.match && prevProps.match.params && prevProps.match.params.letter;
    const nextParam =
      this.props.match && this.props.match.params && this.props.match.params.letter;
    if (prevParam !== nextParam) {
      const letter = letterFromRoute(nextParam);
      if (letter) {
        this.loadLetter(letter);
      }
    }

    const { favorites, recentlyPlayed } = this.state;
    if (
      favorites !== prevState.favorites ||
      recentlyPlayed !== prevState.recentlyPlayed
    ) {
      localStorage.setItem(
        STATE_KEY,
        JSON.stringify({ favorites, recentlyPlayed })
      );
    }
  }

  loadLetter = (letter) => {
    const generation = this.fetchGeneration + 1;
    this.fetchGeneration = generation;
    this.setState({
      loading: true,
      error: null,
      activeLetter: letter,
      searchQuery: '',
    });

    fetch(`${process.env.PUBLIC_URL}/json/${letter}songs.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${letter} songs (${response.status})`);
        }
        return response.json();
      })
      .then((songListJson) => {
        if (this.fetchGeneration !== generation) {
          return;
        }
        const pendingPlay = this.state.pendingPlay;
        const orphanPending =
          pendingPlay &&
          pendingPlay.path &&
          songListJson.indexOf(pendingPlay.path) === -1;
        const applyPending =
          pendingPlay &&
          pendingPlay.path &&
          songListJson.indexOf(pendingPlay.path) !== -1;
        this.setState({
          songList: songListJson,
          loading: false,
          error: null,
          ...(orphanPending ? { pendingPlay: null } : {}),
          ...(applyPending
            ? {
                currentlyPlayingPath: pendingPlay.path,
                seekToSeconds:
                  typeof pendingPlay.seekTo === 'number' && pendingPlay.seekTo > 0
                    ? pendingPlay.seekTo
                    : 0,
                pendingPlay: null,
              }
            : {}),
        });
      })
      .catch((err) => {
        if (this.fetchGeneration !== generation) {
          return;
        }
        this.setState({
          loading: false,
          error: err.message || 'Failed to load songs',
        });
      });
  }

  retryLoad = () => {
    this.loadLetter(this.state.activeLetter);
  }

  toggleAddRemoveFavorites = (songPath) => {
    if (songPath in this.state.favorites) {
      const favorites = Object.keys(this.state.favorites)
        .filter((path) => path !== songPath)
        .reduce((acc, path) => ({ ...acc, [path]: this.state.favorites[path] }), {});
      this.setState({ favorites });
    } else {
      this.setState({
        favorites: {
          ...this.state.favorites,
          [songPath]: {
            title: prepareSongForDisplay(songPath),
            at: Date.now(),
          },
        },
      });
    }
  }

  deleteAllFaves = () => {
    this.setState({ favorites: {} });
  }

  deleteAllRecents = () => {
    this.setState({ recentlyPlayed: {} });
  }

  recordPlayed = (songPath) => {
    const at = Date.now();
    const previous = this.state.recentlyPlayed[songPath] || {};
    const withoutCurrent = Object.keys(this.state.recentlyPlayed)
      .filter((path) => path !== songPath)
      .reduce((acc, path) => ({ ...acc, [path]: this.state.recentlyPlayed[path] }), {});

    const recentlyPlayed = {
      [songPath]: {
        title: prepareSongForDisplay(songPath),
        at,
        positionSeconds:
          typeof previous.positionSeconds === 'number'
            ? previous.positionSeconds
            : 0,
        durationSeconds:
          typeof previous.durationSeconds === 'number'
            ? previous.durationSeconds
            : null,
      },
      ...withoutCurrent,
    };

    const capped = Object.keys(recentlyPlayed)
      .slice(0, RECENTS_CAP)
      .reduce((acc, path) => ({ ...acc, [path]: recentlyPlayed[path] }), {});

    this.setState({ recentlyPlayed: capped });
  }

  updatePlaybackPosition = (songPath, positionSeconds, durationSeconds) => {
    const existing = this.state.recentlyPlayed[songPath];
    if (!existing) {
      return;
    }
    const nextPosition = Number(positionSeconds);
    const nextDuration = Number(durationSeconds);
    const position = Number.isFinite(nextPosition) && nextPosition >= 0
      ? nextPosition
      : 0;
    const duration =
      Number.isFinite(nextDuration) && nextDuration > 0 ? nextDuration : null;

    // Ignore near-zero writes that would wipe a meaningful saved offset
    // (common when a new <audio> starts at t=0 before resume seek applies).
    const previousPosition = Number(existing.positionSeconds) || 0;
    if (position < 1 && previousPosition > 5) {
      return;
    }

    if (
      existing.positionSeconds === position &&
      existing.durationSeconds === duration
    ) {
      return;
    }

    this.setState({
      recentlyPlayed: {
        ...this.state.recentlyPlayed,
        [songPath]: {
          ...existing,
          positionSeconds: position,
          durationSeconds: duration,
          at: Date.now(),
        },
      },
    });
  }

  removeRecent = (songPath) => {
    const recentlyPlayed = Object.keys(this.state.recentlyPlayed)
      .filter((path) => path !== songPath)
      .reduce((acc, path) => ({ ...acc, [path]: this.state.recentlyPlayed[path] }), {});
    this.setState({ recentlyPlayed });
  }

  seekForPath = (songPath, { resume }) => {
    const recent = this.state.recentlyPlayed[songPath];
    if (!resume) {
      return 0;
    }
    if (!recent) {
      return 0;
    }
    return resumeSeekSeconds(recent.positionSeconds, recent.durationSeconds);
  }

  playMixtape = (songPath, { resume } = { resume: false }) => {
    if (!songPath) {
      return;
    }
    const letter = letterForSongKey(songPath);
    const seekTo = this.seekForPath(songPath, { resume: !!resume });
    const pendingPlay = { path: songPath, seekTo };
    const routeLetter = letterFromRoute(
      this.props.match && this.props.match.params && this.props.match.params.letter
    );

    if (routeLetter !== letter) {
      this.setState({ pendingPlay }, () => {
        this.props.history.push('/' + letterToRoute(letter));
      });
      return;
    }

    if (this.state.songList.indexOf(songPath) === -1) {
      this.setState({ pendingPlay });
      return;
    }

    this.setState({
      currentlyPlayingPath: songPath,
      seekToSeconds: seekTo,
      pendingPlay: null,
    });
  }

  selectTrack = (songPath) => {
    if (!songPath) {
      return;
    }
    // Play requests from an expanded row; re-play of the current track is a no-op.
    if (this.state.currentlyPlayingPath === songPath) {
      return;
    }
    this.setState({
      currentlyPlayingPath: songPath,
      seekToSeconds: 0,
    });
  }

  clearPlayback = () => {
    this.setState({
      currentlyPlayingPath: null,
      seekToSeconds: 0,
    });
  }

  clearSeek = () => {
    if (this.state.seekToSeconds) {
      this.setState({ seekToSeconds: 0 });
    }
  }

  sortedSongList = () => {
    return [...this.state.songList].sort(compareSongsForDisplay);
  }

  playAdjacentTrack = (offset) => {
    const { currentlyPlayingPath } = this.state;
    const sorted = this.sortedSongList();
    if (!sorted.length) {
      this.clearPlayback();
      return;
    }
    const index = currentlyPlayingPath
      ? sorted.indexOf(currentlyPlayingPath)
      : -1;
    const nextIndex = index === -1 && offset > 0 ? 0 : index + offset;
    const nextPath = sorted[nextIndex];
    if (nextPath) {
      this.setState({
        currentlyPlayingPath: nextPath,
        seekToSeconds: 0,
      });
      return;
    }
    this.clearPlayback();
  }

  playNextTrack = () => {
    this.playAdjacentTrack(1);
  }

  playPreviousTrack = () => {
    this.playAdjacentTrack(-1);
  }

  ensureSearchIndex = () => {
    if (this.state.searchIndex || this.state.searchIndexError) {
      return;
    }
    if (this.searchIndexPromise) {
      return;
    }
    this.setState({ searchIndexLoading: true });
    this.searchIndexPromise = fetch(`${process.env.PUBLIC_URL}/json/index.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Search index unavailable (${response.status})`);
        }
        return response.json();
      })
      .then((searchIndex) => {
        this.setState({
          searchIndex,
          searchIndexLoading: false,
          searchIndexError: null,
        });
      })
      .catch((err) => {
        this.setState({
          searchIndexLoading: false,
          searchIndexError: err.message || 'Search unavailable',
        });
        this.searchIndexPromise = null;
      });
  }

  handleSearchChange = (e) => {
    this.setState({ searchQuery: e.target.value });
  }

  jumpToLetter = (letter) => {
    this.props.history.push('/' + letterToRoute(letter));
  }

  searchResults = () => {
    const { searchQuery, searchIndex } = this.state;
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
  }

  renderDrawer = () => {
    const { favorites, recentlyPlayed } = this.state;
    const favoritesLength = Object.keys(favorites).length;
    const recentlyPlayedLength = Object.keys(recentlyPlayed).length;
    if (favoritesLength > 0 || recentlyPlayedLength > 0) {
      return (
          <Drawer favorites={this.state.favorites}
                  deleteAllFaves={this.deleteAllFaves}
                  deleteAllRecents={this.deleteAllRecents}
                  recentlyPlayed={this.state.recentlyPlayed}
                  toggleAddRemoveFavorites={this.toggleAddRemoveFavorites}
                  removeRecent={this.removeRecent}
                  onPlayMixtape={this.playMixtape} />
      )
    }
  }

  renderSearch = () => {
    const {
      searchQuery,
      searchIndexError,
      searchIndexLoading,
    } = this.state;
    const results = this.searchResults();
    const queryActive = searchQuery.trim().length > 0;

    return (
      <div className="search-wrapper">
        <input
          type="search"
          className="song-search"
          placeholder="Search all mixtapes…"
          value={searchQuery}
          disabled={!!searchIndexError}
          onFocus={this.ensureSearchIndex}
          onChange={this.handleSearchChange}
        />
        {searchIndexError ? (
          <p className="search-status">{searchIndexError}</p>
        ) : null}
        {searchIndexLoading ? (
          <p className="search-status">Loading search index…</p>
        ) : null}
        {queryActive && !searchIndexError ? (
          <ul className="search-results">
            {results.length === 0 ? (
              <li className="search-empty">No matches</li>
            ) : (
              results.map((entry) => (
                <li key={entry.path}>
                  <span className="search-title">{entry.title}</span>
                  <button
                    type="button"
                    onClick={() => this.jumpToLetter(entry.letter)}
                  >
                    Go to {entry.letter === 'NUM' ? '#' : entry.letter}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    );
  }

  renderSongsArea = () => {
    const {
      loading,
      error,
      songList,
      favorites,
      searchQuery,
      currentlyPlayingPath,
    } = this.state;
    if (searchQuery.trim()) {
      return null;
    }
    if (loading) {
      return <div className="body-content">Loading…</div>;
    }
    if (error) {
      return (
        <div className="body-content">
          <p>{error}</p>
          <button type="button" onClick={this.retryLoad}>
            Retry
          </button>
        </div>
      );
    }
    return (
      <Songs
        songList={songList}
        key={this.state.activeLetter}
        favorites={favorites}
        currentlyPlayingPath={currentlyPlayingPath}
        onSelectTrack={this.selectTrack}
        toggleAddRemoveFavorites={this.toggleAddRemoveFavorites}
      />
    );
  }

  renderPlaybackBar = () => {
    const {
      currentlyPlayingPath,
      seekToSeconds,
      favorites,
    } = this.state;
    return (
      <BottomPlaybackBar
        currentPath={currentlyPlayingPath}
        seekToSeconds={seekToSeconds}
        favorites={favorites}
        toggleAddRemoveFavorites={this.toggleAddRemoveFavorites}
        recordPlayed={this.recordPlayed}
        updatePlaybackPosition={this.updatePlaybackPosition}
        onSeekApplied={this.clearSeek}
        onNext={this.playNextTrack}
        onPrevious={this.playPreviousTrack}
      />
    );
  }

  render = () => {
    const routeLetter = letterFromRoute(
      this.props.match && this.props.match.params && this.props.match.params.letter
    );
    if (!routeLetter) {
      return <NotFound />;
    }

    return (
      <React.Fragment>
        <div className="container has-bottom-playback">
          <Header />
          <AlphabetMenu activeLetter={this.state.activeLetter}/>
          { this.renderDrawer() }
          { this.renderSearch() }
          { this.renderSongsArea() }
        </div>
        { this.renderPlaybackBar() }
        <ScrollToTop showUnder={160}>
            <span><i className="scroll-up fa fa-angle-double-up "></i></span>
        </ScrollToTop>
      </React.Fragment>
    )
  }
}

class Header extends Component {
  render = () => {
    return (
      <div className="App clearfix">
        <header className="App-header">
          <div className="logo"></div>
          <h1 className="App-title">For Promotional Use Only</h1>
          <div className='slogan'>Classic Rave Music from the 90s and Beyond</div>
          <div className="social-media">
            <ul>
              <li>
                <a href="mailto:josh@attenberg.org"><i className="far fa-envelope"></i></a>
              </li>
            </ul>
          </div>
        </header>
      </div>
    );
  }
}

export default App;
