import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

jest.mock('react-responsive-audio-player', () => {
  const React = require('react');
  class MockAudioPlayer extends React.Component {
    componentDidMount() {
      if (this.props.audioElementRef) {
        this.audio = {
          currentTime: 0,
          duration: 120,
          readyState: 4,
          play: () => Promise.resolve(),
          pause: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        };
        this.props.audioElementRef(this.audio);
      }
    }

    componentWillUnmount() {
      if (this.props.audioElementRef) {
        this.props.audioElementRef(null);
      }
    }

    render() {
      return React.createElement('div', { 'data-mock-player': 'true' });
    }
  }
  return MockAudioPlayer;
});

const kSongs = ['mixtape/kinetic_energy.mp3', 'mixtape/kruder_set.mp3'];
const mSong = 'mixtape/mixmaster_mike.mp3';

describe('App deferred playback requests', () => {
  let container;
  let history;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    history = { push: jest.fn() };
    localStorage.clear();
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    delete global.fetch;
  });

  /** Render App on a letter route, resolving the letter fetch on demand. */
  const renderApp = (letter, songList) => {
    let resolveFetch;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = () =>
            resolve({ ok: true, status: 200, json: () => Promise.resolve(songList) });
        })
    );

    let app;
    act(() => {
      ReactDOM.render(
        <MemoryRouter initialEntries={['/' + letter]}>
          <App
            ref={(node) => {
              app = node || app;
            }}
            match={{ params: { letter } }}
            history={history}
          />
        </MemoryRouter>,
        container
      );
    });
    return { app, settleFetch: async () => { await act(async () => { resolveFetch(); }); } };
  };

  it('stops the loaded track when a cross-letter request defers playback', async () => {
    const { app, settleFetch } = renderApp('k', kSongs);
    await settleFetch();

    act(() => {
      app.selectTrack(kSongs[0]);
    });
    expect(app.state.currentlyPlayingPath).toBe(kSongs[0]);
    expect(container.querySelector('[data-mock-player]')).not.toBeNull();

    act(() => {
      app.playMixtape(mSong, { resume: false });
    });

    expect(app.state.pendingPlay).toEqual({ path: mSong, seekTo: 0 });
    expect(history.push).toHaveBeenCalledWith('/m');
    expect(app.state.currentlyPlayingPath).toBeNull();
    expect(container.querySelector('[data-mock-player]')).toBeNull();
  });

  it('stops the loaded track when the requested song is not in the loaded list yet', async () => {
    const { app, settleFetch } = renderApp('k', kSongs);
    await settleFetch();

    act(() => {
      app.selectTrack(kSongs[0]);
    });
    expect(app.state.currentlyPlayingPath).toBe(kSongs[0]);

    act(() => {
      app.playMixtape('mixtape/kaleidoscope_live.mp3', { resume: false });
    });

    expect(app.state.pendingPlay).toEqual({
      path: 'mixtape/kaleidoscope_live.mp3',
      seekTo: 0,
    });
    expect(history.push).not.toHaveBeenCalled();
    expect(app.state.currentlyPlayingPath).toBeNull();
    expect(container.querySelector('[data-mock-player]')).toBeNull();
  });

  it('plays immediately when the requested song is already loaded', async () => {
    const { app, settleFetch } = renderApp('k', kSongs);
    await settleFetch();

    act(() => {
      app.playMixtape(kSongs[1], { resume: false });
    });

    expect(app.state.currentlyPlayingPath).toBe(kSongs[1]);
    expect(app.state.pendingPlay).toBeNull();
    expect(history.push).not.toHaveBeenCalled();
  });

  it('applies a deferred request once the target list loads', async () => {
    const { app, settleFetch } = renderApp('k', kSongs);
    await settleFetch();

    act(() => {
      app.playMixtape('mixtape/kaleidoscope_live.mp3', { resume: false });
    });
    expect(app.state.currentlyPlayingPath).toBeNull();

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([...kSongs, 'mixtape/kaleidoscope_live.mp3']),
      })
    );
    await act(async () => {
      app.retryLoad();
    });

    expect(app.state.currentlyPlayingPath).toBe('mixtape/kaleidoscope_live.mp3');
    expect(app.state.pendingPlay).toBeNull();
  });

  it('advances through album tracks in catalog order, not global title sort', async () => {
    const albumPayload = {
      tracks: [
        'mixtape/CoverCDs/Album Alpha/01 Zebra.mp3',
        'mixtape/CoverCDs/Album Alpha/02 Alpha.mp3',
        'mixtape/CoverCDs/Album Beta/01 Beta.mp3',
      ],
      albums: [
        {
          id: 'CoverCDs/Album Alpha',
          title: 'Album Alpha',
          tracks: [
            'mixtape/CoverCDs/Album Alpha/01 Zebra.mp3',
            'mixtape/CoverCDs/Album Alpha/02 Alpha.mp3',
          ],
        },
        {
          id: 'CoverCDs/Album Beta',
          title: 'Album Beta',
          tracks: ['mixtape/CoverCDs/Album Beta/01 Beta.mp3'],
        },
      ],
    };

    const { app, settleFetch } = renderApp('c', albumPayload);
    await settleFetch();

    act(() => {
      app.selectTrack(albumPayload.albums[0].tracks[0]);
    });
    act(() => {
      app.playNextTrack();
    });

    expect(app.state.currentlyPlayingPath).toBe(albumPayload.albums[0].tracks[1]);
  });
});
