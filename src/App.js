import React, { Component } from 'react';
import AlphabetMenu from './AlphabetMenu';
import Songs from './Songs';
import Drawer from './Drawer';
import ScrollToTop from 'react-scroll-up';
import { prepareSongForDisplay } from './songUtils';

const STATE_KEY = 'state.v2';
const RECENTS_CAP = 50;

const defaultState = () => ({
  activeLetter: 'K',
  songList: [],
  favorites: {},
  recentlyPlayed: {},
  loading: false,
  error: null,
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
      activeLetter: parsed.activeLetter || undefined,
    };
  } catch (e) {
    return {};
  }
};

class App extends Component {
  constructor(props) {
    super(props);

    const persisted = loadPersistedState();
    this.state = {
      ...defaultState(),
      ...persisted,
      songList: require('./static/json/Ksongs.json'),
    };
  }

  componentDidUpdate(prevProps, prevState) {
    const { favorites, recentlyPlayed, activeLetter } = this.state;
    if (
      favorites !== prevState.favorites ||
      recentlyPlayed !== prevState.recentlyPlayed ||
      activeLetter !== prevState.activeLetter
    ) {
      localStorage.setItem(
        STATE_KEY,
        JSON.stringify({ favorites, recentlyPlayed, activeLetter })
      );
    }
  }

  selectLetter = (letter) => {
    const activeLetter = letter;
    this.setState({ loading: true, error: null, activeLetter });

    fetch(`${process.env.PUBLIC_URL}/json/${letter}songs.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${letter} songs (${response.status})`);
        }
        return response.json();
      })
      .then((songListJson) => {
        if (this.state.activeLetter !== activeLetter) {
          return;
        }
        this.setState({
          songList: songListJson,
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        if (this.state.activeLetter !== activeLetter) {
          return;
        }
        this.setState({
          loading: false,
          error: err.message || 'Failed to load songs',
        });
      });
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
    const withoutCurrent = Object.keys(this.state.recentlyPlayed)
      .filter((path) => path !== songPath)
      .reduce((acc, path) => ({ ...acc, [path]: this.state.recentlyPlayed[path] }), {});

    const recentlyPlayed = {
      [songPath]: {
        title: prepareSongForDisplay(songPath),
        at,
      },
      ...withoutCurrent,
    };

    const capped = Object.keys(recentlyPlayed)
      .slice(0, RECENTS_CAP)
      .reduce((acc, path) => ({ ...acc, [path]: recentlyPlayed[path] }), {});

    this.setState({ recentlyPlayed: capped });
  }

  removeRecent = (songPath) => {
    const recentlyPlayed = Object.keys(this.state.recentlyPlayed)
      .filter((path) => path !== songPath)
      .reduce((acc, path) => ({ ...acc, [path]: this.state.recentlyPlayed[path] }), {});
    this.setState({ recentlyPlayed });
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
                  removeRecent={this.removeRecent} />
      )
    }
  }

  renderSongsArea = () => {
    const { loading, error, songList, activeLetter, favorites } = this.state;
    if (loading) {
      return <div className="body-content">Loading…</div>;
    }
    if (error) {
      return (
        <div className="body-content">
          <p>{error}</p>
          <button type="button" onClick={() => this.selectLetter(activeLetter)}>
            Retry
          </button>
        </div>
      );
    }
    return (
      <Songs songList={songList}
             key={activeLetter}
             favorites={favorites}
             toggleAddRemoveFavorites={this.toggleAddRemoveFavorites}
             recordPlayed={this.recordPlayed}
      />
    );
  }

  render = () => {
    return (
      <React.Fragment>
        <div className="container">
          <Header />
          <AlphabetMenu selectLetter={this.selectLetter} activeLetter={this.state.activeLetter}/>
          { this.renderDrawer() }
          { this.renderSongsArea() }
        </div>
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
                <a href=""><i className="fab fa-twitter"></i></a>
              </li>
              <li>
                <a href="" ><i className="fab fa-facebook"></i></a>
              </li>
              <li>
                <a href="" ><i className="fas fa-share-square"></i></a>
              </li>
              <li>
                <a href="" ><i className="far fa-envelope"></i></a>
              </li>
            </ul>
          </div>
        </header>
      </div>
    );
  }
}

export default App;
