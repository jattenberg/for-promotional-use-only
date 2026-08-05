export const MEDIA_BASE = 'https://for-promotional-use-only.com/';

export const titleCase = (input) => {
  return input.trim()
    .split(/\s+/)
    .map((x) => x.substring(0, 1).toUpperCase() + x.slice(1))
    .join(' ');
};

export const cleanSong = (song) => {
  return song.replace(/_/g, ' ')
    .replace('mixtape/', '')
    .replace(/\.mp4$/i, '')
    .replace(/\.mp3$/i, '')
    .replace(/\.m4a$/i, '')
    .replace(/(\w)-(\w)/g, (x) => x[0] + ' ' + x[2]);
};

export const prepareSongForDisplay = (song) => {
  return titleCase(cleanSong(song));
};

/** Display title for a track file (basename only, for nested album rows). */
export const prepareTrackTitle = (path) => {
  const basename = path.split('/').pop() || path;
  return titleCase(
    basename
      .replace(/_/g, ' ')
      .replace(/\.mp4$/i, '')
      .replace(/\.mp3$/i, '')
      .replace(/\.m4a$/i, '')
      .replace(/(\w)-(\w)/g, (x) => x[0] + ' ' + x[2])
  );
};

export const findAlbumIdForTrack = (albums, trackPath) => {
  const match = (albums || []).find((album) => album.tracks.indexOf(trackPath) !== -1);
  return match ? match.id : null;
};

export const compareSongsForDisplay = (a, b) => {
  return prepareSongForDisplay(a).localeCompare(prepareSongForDisplay(b));
};

/**
 * Normalize letter JSON payloads from legacy flat arrays or album-aware objects.
 */
/**
 * Build sorted playlist rows: album parents (by title) and orphan tracks (by display title).
 */
export const buildDisplayRows = (songList, albums = []) => {
  const inAlbum = albums.reduce(
    (paths, album) =>
      album.tracks.reduce((acc, track) => ({ ...acc, [track]: true }), paths),
    {}
  );
  const orphanTracks = songList.filter((path) => !inAlbum[path]);
  const rows = [
    ...albums.map((album) => ({
      type: 'album',
      album,
      sortKey: album.title,
    })),
    ...orphanTracks.map((path) => ({
      type: 'track',
      path,
      sortKey: prepareSongForDisplay(path),
    })),
  ];
  return rows.sort((left, right) => left.sortKey.localeCompare(right.sortKey));
};

/**
 * Flat play order for prev/next: album tracks stay grouped in catalog order.
 */
export const buildNavigationOrder = (songList, albums) => {
  return buildDisplayRows(songList, albums).flatMap((row) =>
    row.type === 'album' ? row.album.tracks : [row.path]
  );
};

export const parseLetterPayload = (payload) => {
  if (Array.isArray(payload)) {
    return { tracks: payload, albums: [] };
  }
  if (payload && Array.isArray(payload.tracks)) {
    return {
      tracks: payload.tracks,
      albums: Array.isArray(payload.albums) ? payload.albums : [],
    };
  }
  return { tracks: [], albums: [] };
};

export const mediaUrl = (path) => {
  return MEDIA_BASE + path.split('/').map(encodeURIComponent).join('/');
};

export const letterForSongKey = (key) => {
  const remainder = key.replace(/^mixtape\//, '');
  if (!remainder) {
    return 'NUM';
  }
  const first = remainder.charAt(0).toUpperCase();
  if (first >= 'A' && first <= 'Z') {
    return first;
  }
  return 'NUM';
};

export const letterFromRoute = (param) => {
  if (!param || typeof param !== 'string') {
    return null;
  }
  const lower = param.toLowerCase();
  if (lower === 'num') {
    return 'NUM';
  }
  if (lower.length === 1 && lower >= 'a' && lower <= 'z') {
    return lower.toUpperCase();
  }
  return null;
};

export const letterToRoute = (letter) => {
  if (letter === 'NUM') {
    return 'num';
  }
  return String(letter).toLowerCase();
};

/** Seconds near the end of a track that should restart from 0 on resume. */
export const NEAR_END_SECONDS = 5;

/**
 * Choose a seek offset for resume playback.
 *
 * Returns 0 when position is missing, non-finite, negative, or within
 * NEAR_END_SECONDS of duration (treat finished listens as a fresh start).
 *
 * Args:
 *   positionSeconds (number|null|undefined): Last known currentTime.
 *   durationSeconds (number|null|undefined): Last known duration, if any.
 *
 * Returns:
 *   number: Non-negative seek offset in seconds.
 */
export const resumeSeekSeconds = (positionSeconds, durationSeconds) => {
  const position = Number(positionSeconds);
  if (!Number.isFinite(position) || position <= 0) {
    return 0;
  }
  const duration = Number(durationSeconds);
  if (Number.isFinite(duration) && duration > 0) {
    if (position >= duration - NEAR_END_SECONDS) {
      return 0;
    }
    if (position >= duration) {
      return 0;
    }
  }
  return position;
};
