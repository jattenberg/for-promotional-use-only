import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import Songs from './Songs';

jest.mock('react-responsive-audio-player', () => {
  const React = require('react');
  return () => React.createElement('div', { 'data-mock-player': 'true' });
});

const album = {
  id: 'CoverCDs/Knowledge Magazine 33 Phuturistic Bluez',
  title: 'Knowledge Magazine 33 Phuturistic Bluez',
  tracks: [
    'mixtape/CoverCDs/Knowledge Magazine 33 Phuturistic Bluez/01 Regret.mp3',
    'mixtape/CoverCDs/Knowledge Magazine 33 Phuturistic Bluez/02 Next Track.mp3',
  ],
};

const orphan = 'mixtape/kinetic_energy.mp3';

describe('Songs album collapse', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  });

  const renderSongs = (props = {}) => {
    act(() => {
      ReactDOM.render(
        <Songs
          songList={[...album.tracks, orphan]}
          albums={[album]}
          favorites={{}}
          currentlyPlayingPath={null}
          onSelectTrack={props.onSelectTrack || jest.fn()}
          toggleAddRemoveFavorites={jest.fn()}
        />,
        container
      );
    });
  };

  it('expands an album without starting playback', () => {
    const onSelectTrack = jest.fn();
    renderSongs({ onSelectTrack });

    const albumRow = container.querySelector('.single-song-wrapper--album');
    expect(albumRow).not.toBeNull();
    expect(container.querySelector('.songlist--album-tracks')).toBeNull();

    act(() => {
      albumRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.songlist--album-tracks')).not.toBeNull();
    expect(onSelectTrack).not.toHaveBeenCalled();
    expect(container.querySelector('[data-mock-player]')).toBeNull();
  });

  it('plays a child track after expand then play', () => {
    const onSelectTrack = jest.fn();
    renderSongs({ onSelectTrack });

    act(() => {
      container
        .querySelector('.single-song-wrapper--album')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const playButtons = container.querySelectorAll(
      '.songlist--album-tracks .song-play-control'
    );
    expect(playButtons.length).toBe(album.tracks.length);

    act(() => {
      playButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelectTrack).toHaveBeenCalledWith(album.tracks[0]);
  });

  it('shows nested track titles as basenames under the album', () => {
    renderSongs();

    act(() => {
      container
        .querySelector('.single-song-wrapper--album')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toMatch(/01 Regret/);
    expect(container.textContent).toMatch(/02 Next Track/);
    expect(container.textContent).not.toMatch(/Knowledge Magazine 33 Phuturistic Bluez\/01/);
  });

  it('still renders orphan tracks outside albums', () => {
    renderSongs();
    expect(container.textContent).toMatch(/Kinetic Energy/);
    expect(
      container.querySelectorAll('.single-song-wrapper:not(.single-song-wrapper--album)').length
    ).toBeGreaterThan(0);
  });
});

describe('parseLetterPayload', () => {
  const { parseLetterPayload } = require('./songUtils');

  it('accepts legacy flat arrays', () => {
    expect(parseLetterPayload(['mixtape/a.mp3'])).toEqual({
      tracks: ['mixtape/a.mp3'],
      albums: [],
    });
  });

  it('accepts album-aware payloads', () => {
    expect(
      parseLetterPayload({
        tracks: ['mixtape/a.mp3'],
        albums: [album],
      })
    ).toEqual({
      tracks: ['mixtape/a.mp3'],
      albums: [album],
    });
  });
});
