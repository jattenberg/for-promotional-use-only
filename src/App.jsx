import { useEffect } from 'react';
import ScrollToTop from 'react-scroll-up';
import AlphabetMenu from './AlphabetMenu';
import BottomPlaybackBar from './BottomPlaybackBar';
import Drawer from './Drawer';
import { promoDocumentTitle, setDocumentCanonical } from './documentTitle';
import NotFound from './NotFound';
import Songs from './Songs';
import { letterFromRoute, letterToRoute } from './songUtils';
import { usePromoApp } from './usePromoApp';
import { useParams, useNavigate } from 'react-router-dom';

function Header() {
  return (
    <div className="App clearfix">
      <header className="App-header">
        <div className="logo" />
        <h1 className="App-title">For Promotional Use Only</h1>
        <div className="slogan">Classic Rave Music from the 90s and Beyond</div>
        <div className="social-media">
          <ul>
            <li>
              <a href="mailto:josh@attenberg.org" aria-label="Email josh@attenberg.org">
                <i className="far fa-envelope" aria-hidden="true" />
              </a>
            </li>
          </ul>
        </div>
      </header>
    </div>
  );
}

export default function App() {
  const { letter } = useParams();
  const routeLetter = letterFromRoute(letter);
  const navigate = useNavigate();
  const app = usePromoApp(routeLetter, navigate);

  useEffect(() => {
    if (!routeLetter) {
      return;
    }
    document.title = promoDocumentTitle(app.activeLetter, app.searchQuery);
    setDocumentCanonical('/' + letterToRoute(routeLetter));
  }, [routeLetter, app.activeLetter, app.searchQuery]);

  if (!routeLetter) {
    return <NotFound />;
  }

  const favoritesLength = Object.keys(app.favorites).length;
  const recentlyPlayedLength = Object.keys(app.recentlyPlayed).length;
  const showDrawer = favoritesLength > 0 || recentlyPlayedLength > 0;
  const searchResults = app.searchResults();
  const queryActive = app.searchQuery.trim().length > 0;

  return (
    <>
      <div className="container has-bottom-playback">
        <Header />
        <AlphabetMenu activeLetter={app.activeLetter} />
        {showDrawer ? (
          <Drawer
            favorites={app.favorites}
            deleteAllFaves={app.deleteAllFaves}
            deleteAllRecents={app.deleteAllRecents}
            recentlyPlayed={app.recentlyPlayed}
            toggleAddRemoveFavorites={app.toggleAddRemoveFavorites}
            removeRecent={app.removeRecent}
            onPlayMixtape={app.playMixtape}
          />
        ) : null}
        <div className="search-wrapper">
          <input
            type="search"
            className="song-search"
            placeholder="Search all mixtapes…"
            value={app.searchQuery}
            disabled={!!app.searchIndexError}
            onFocus={app.ensureSearchIndex}
            onChange={app.handleSearchChange}
          />
          {app.searchIndexError ? (
            <p className="search-status">{app.searchIndexError}</p>
          ) : null}
          {app.searchIndexLoading ? (
            <p className="search-status">Loading search index…</p>
          ) : null}
          {queryActive && !app.searchIndexError ? (
            <ul className="search-results">
              {searchResults.length === 0 ? (
                <li className="search-empty">No matches</li>
              ) : (
                searchResults.map((entry) => (
                  <li key={entry.path}>
                    <span className="search-title">{entry.title}</span>
                    <button type="button" onClick={() => app.jumpToLetter(entry.letter)}>
                      Go to {entry.letter === 'NUM' ? '#' : entry.letter}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
        {queryActive ? null : app.loading ? (
          <div className="body-content">Loading…</div>
        ) : app.error ? (
          <div className="body-content">
            <p>{app.error}</p>
            <button type="button" onClick={app.retryLoad}>Retry</button>
          </div>
        ) : (
          <Songs
            songList={app.songList}
            albums={app.albums}
            key={app.activeLetter}
            favorites={app.favorites}
            currentlyPlayingPath={app.currentlyPlayingPath}
            onSelectTrack={app.selectTrack}
            toggleAddRemoveFavorites={app.toggleAddRemoveFavorites}
          />
        )}
      </div>
      <BottomPlaybackBar
        currentPath={app.currentlyPlayingPath}
        seekToSeconds={app.seekToSeconds}
        favorites={app.favorites}
        toggleAddRemoveFavorites={app.toggleAddRemoveFavorites}
        recordPlayed={app.recordPlayed}
        updatePlaybackPosition={app.updatePlaybackPosition}
        onSeekApplied={app.clearSeek}
        onNext={app.playNextTrack}
        onPrevious={app.playPreviousTrack}
      />
      <ScrollToTop showUnder={160}>
        <span><i className="scroll-up fa fa-angle-double-up " /></span>
      </ScrollToTop>
    </>
  );
}
