export const MEDIA_BASE = 'http://for-promotional-use-only.com/';

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

export const compareSongsForDisplay = (a, b) => {
  return prepareSongForDisplay(a).localeCompare(prepareSongForDisplay(b));
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
