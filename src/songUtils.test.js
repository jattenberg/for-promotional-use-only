import {
  cleanSong,
  compareSongsForDisplay,
  letterForSongKey,
  letterFromRoute,
  mediaUrl,
  prepareSongForDisplay,
  resumeSeekSeconds,
} from './songUtils';

describe('prepareSongForDisplay', () => {
  it('drops prefix/extension, underscores → spaces, title-cases', () => {
    expect(prepareSongForDisplay('mixtape/dj_seduction_-_live.mp3')).toBe(
      'Dj Seduction - Live'
    );
  });
});

describe('mediaUrl', () => {
  it('encodes spaces as %20 and preserves /', () => {
    expect(mediaUrl('mixtape/a track with spaces.mp3')).toBe(
      'http://for-promotional-use-only.com/mixtape/a%20track%20with%20spaces.mp3'
    );
  });

  it('keeps nested / and escapes # and &', () => {
    expect(mediaUrl('mixtape/sub dir/track #1 & more.m4a')).toBe(
      'http://for-promotional-use-only.com/mixtape/sub%20dir/track%20%231%20%26%20more.m4a'
    );
  });
});

describe('letterForSongKey', () => {
  it('buckets leading digit to NUM', () => {
    expect(letterForSongKey('mixtape/2 bad mice.mp3')).toBe('NUM');
  });

  it('buckets nested paths on the subdirectory first char', () => {
    expect(
      letterForSongKey(
        "mixtape/AWOL '93/Fabio - AWOL 'Live In London' March 1993 1.mp3"
      )
    ).toBe('A');
  });
});

describe('compareSongsForDisplay', () => {
  it('gives stable A→Z order for mixed-case titles', () => {
    const unsorted = [
      'mixtape/zebra.mp3',
      'mixtape/Alpha.mp3',
      'mixtape/bravo.mp3',
      'mixtape/Charlie.mp3',
    ];
    const sorted = [...unsorted].sort(compareSongsForDisplay);
    expect(sorted.map(prepareSongForDisplay)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
      'Zebra',
    ]);
  });
});

describe('letterFromRoute', () => {
  it('maps lowercase letter and num', () => {
    expect(letterFromRoute('k')).toBe('K');
    expect(letterFromRoute('num')).toBe('NUM');
    expect(letterFromRoute('zz')).toBe(null);
  });
});

describe('cleanSong', () => {
  it('strips mixtape prefix and extension', () => {
    expect(cleanSong('mixtape/foo_bar.mp3')).toBe('foo bar');
  });
});

describe('resumeSeekSeconds', () => {
  it('returns 0 for missing or non-positive positions', () => {
    expect(resumeSeekSeconds(null, 100)).toBe(0);
    expect(resumeSeekSeconds(undefined, 100)).toBe(0);
    expect(resumeSeekSeconds(0, 100)).toBe(0);
    expect(resumeSeekSeconds(-3, 100)).toBe(0);
  });

  it('returns the saved position mid-track', () => {
    expect(resumeSeekSeconds(42.5, 120)).toBe(42.5);
  });

  it('restarts near the end of a track', () => {
    expect(resumeSeekSeconds(97, 100)).toBe(0);
    expect(resumeSeekSeconds(100, 100)).toBe(0);
  });

  it('keeps position when duration is unknown', () => {
    expect(resumeSeekSeconds(30, null)).toBe(30);
  });
});
