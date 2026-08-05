import { render, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Songs from './Songs';
import { parseLetterPayload } from './songUtils';

vi.mock('react-responsive-audio-player', () => ({
  default: () => <div data-mock-player="true" />,
}));

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
  const renderSongs = (props = {}) => {
    return render(
      <Songs
        songList={[...album.tracks, orphan]}
        albums={[album]}
        favorites={{}}
        currentlyPlayingPath={null}
        onSelectTrack={props.onSelectTrack || vi.fn()}
        toggleAddRemoveFavorites={vi.fn()}
      />
    );
  };

  it('expands an album without starting playback', () => {
    const onSelectTrack = vi.fn();
    const { container } = renderSongs({ onSelectTrack });

    const albumRow = container.querySelector('.single-song-wrapper--album');
    expect(albumRow).not.toBeNull();
    expect(container.querySelector('.songlist--album-tracks')).toBeNull();

    act(() => {
      fireEvent.click(albumRow);
    });

    const nestedTracks = container.querySelectorAll(
      '.songlist--album-tracks .single-song-wrapper--nested'
    );
    expect(nestedTracks.length).toBe(album.tracks.length);
    expect(onSelectTrack).not.toHaveBeenCalled();
  });

  it('plays a child track after expand then play', () => {
    const onSelectTrack = vi.fn();
    const { container } = renderSongs({ onSelectTrack });

    act(() => {
      fireEvent.click(container.querySelector('.single-song-wrapper--album'));
    });

    const childRow = container.querySelector('.single-song-wrapper--nested');
    act(() => {
      fireEvent.click(childRow);
    });

    const playButton = container.querySelector('.songlist--album-tracks .song-play-control');
    act(() => {
      fireEvent.click(playButton);
    });

    expect(onSelectTrack).toHaveBeenCalledWith(album.tracks[0]);
  });

  it('still renders orphan tracks outside albums', () => {
    const { container } = renderSongs();
    expect(container.textContent).toMatch(/Kinetic Energy/);
    expect(
      container.querySelectorAll('.single-song-wrapper:not(.single-song-wrapper--album)').length
    ).toBeGreaterThan(0);
  });
});

describe('parseLetterPayload', () => {
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
