import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { usePromoApp } from './usePromoApp';

const kSongs = ['mixtape/kinetic_energy.mp3', 'mixtape/kruder_set.mp3'];
const mSong = 'mixtape/mixmaster_mike.mp3';

describe('usePromoApp deferred playback', () => {
  const navigate = vi.fn();

  beforeEach(() => {
    navigate.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete global.fetch;
  });

  const mountHook = (letter, songList) => {
    let resolveFetch;
    global.fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = () =>
            resolve({ ok: true, status: 200, json: () => Promise.resolve(songList) });
        })
    );

    const view = renderHook(() => usePromoApp(letter, navigate));

    return {
      ...view,
      settleFetch: async () => {
        await act(async () => {
          resolveFetch();
        });
      },
    };
  };

  it('defers cross-letter playback and navigates', async () => {
    const { result, settleFetch } = mountHook('K', kSongs);
    await settleFetch();

    act(() => {
      result.current.selectTrack(kSongs[0]);
    });
    expect(result.current.currentlyPlayingPath).toBe(kSongs[0]);

    act(() => {
      result.current.playMixtape(mSong, { resume: false });
    });

    expect(result.current.pendingPlay).toEqual({ path: mSong, seekTo: 0 });
    expect(navigate).toHaveBeenCalledWith('/m');
    expect(result.current.currentlyPlayingPath).toBeNull();
  });

  it('defers when the song is not in the loaded list yet', async () => {
    const { result, settleFetch } = mountHook('K', kSongs);
    await settleFetch();

    act(() => {
      result.current.selectTrack(kSongs[0]);
    });

    act(() => {
      result.current.playMixtape('mixtape/kaleidoscope_live.mp3', { resume: false });
    });

    expect(result.current.pendingPlay).toEqual({
      path: 'mixtape/kaleidoscope_live.mp3',
      seekTo: 0,
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(result.current.currentlyPlayingPath).toBeNull();
  });

  it('plays immediately when the requested song is already loaded', async () => {
    const { result, settleFetch } = mountHook('K', kSongs);
    await settleFetch();

    act(() => {
      result.current.playMixtape(kSongs[1], { resume: false });
    });

    expect(result.current.currentlyPlayingPath).toBe(kSongs[1]);
    expect(result.current.pendingPlay).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('applies a deferred request once the target list loads', async () => {
    const { result, settleFetch } = mountHook('K', kSongs);
    await settleFetch();

    act(() => {
      result.current.playMixtape('mixtape/kaleidoscope_live.mp3', { resume: false });
    });
    expect(result.current.currentlyPlayingPath).toBeNull();

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([...kSongs, 'mixtape/kaleidoscope_live.mp3']),
      })
    );
    await act(async () => {
      result.current.retryLoad();
    });

    expect(result.current.currentlyPlayingPath).toBe('mixtape/kaleidoscope_live.mp3');
    expect(result.current.pendingPlay).toBeNull();
  });

  it('advances through album tracks in catalog order', async () => {
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

    const { result, settleFetch } = mountHook('C', albumPayload);
    await settleFetch();

    act(() => {
      result.current.selectTrack(albumPayload.albums[0].tracks[0]);
    });
    act(() => {
      result.current.playNextTrack();
    });

    expect(result.current.currentlyPlayingPath).toBe(albumPayload.albums[0].tracks[1]);
  });
});
