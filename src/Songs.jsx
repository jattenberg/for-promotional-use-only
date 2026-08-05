import { useState } from 'react';
import {
  buildDisplayRows,
  findAlbumIdForTrack,
  mediaUrl,
  prepareSongForDisplay,
  prepareTrackTitle,
} from './songUtils';

/**
 * Declarative playlist view. Album parents expand to tracks; row click expands
 * play/favorite/download; play starts playback.
 */
export default function Songs({
  songList,
  albums,
  favorites,
  currentlyPlayingPath,
  onSelectTrack,
  toggleAddRemoveFavorites,
}) {
  const [expandedAlbumId, setExpandedAlbumId] = useState(null);
  const [expandedPath, setExpandedPath] = useState(null);

  const toggleAlbum = (albumId) => {
    setExpandedAlbumId((current) => (current === albumId ? null : albumId));
    setExpandedPath(null);
  };

  const expandSong = (songPath) => {
    const parentAlbumId = findAlbumIdForTrack(albums, songPath);
    setExpandedPath((current) => (current === songPath ? null : songPath));
    if (parentAlbumId) {
      setExpandedAlbumId(parentAlbumId);
    }
  };

  const playSong = (event, songPath) => {
    event.stopPropagation();
    if (onSelectTrack) {
      onSelectTrack(songPath);
    }
  };

  const renderTrackActions = (song, songTitle, songSrc, favoriteClass) => (
    <div
      className="clearfix favorite-download favorite-download--row"
      onClick={(event) => event.stopPropagation()}
    >
      <i
        className={favoriteClass}
        onClick={() => toggleAddRemoveFavorites(song)}
        role="button"
        aria-label="Toggle favorite"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleAddRemoveFavorites(song);
          }
        }}
      />
      <a href={songSrc} aria-label="Download track">
        <i className="download fas fa-download" />
      </a>
    </div>
  );

  const renderTrackRow = (song, { nested } = { nested: false }) => {
    const isExpanded = expandedPath === song;
    const isPlaying = currentlyPlayingPath === song;
    const songTitle = nested ? prepareTrackTitle(song) : prepareSongForDisplay(song);
    const songSrc = mediaUrl(song);
    const favoriteClass =
      favorites && Object.prototype.hasOwnProperty.call(favorites, song)
        ? 'favorite fas fa-star already-favorited'
        : 'favorite far fa-star';
    const rowClass = [
      'single-song-wrapper',
      nested ? 'single-song-wrapper--nested' : null,
      isExpanded ? 'expanded' : null,
      isPlaying ? 'active' : null,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <li className={rowClass} key={song} onClick={() => expandSong(song)}>
        <span className="title">
          {isExpanded ? (
            <button
              type="button"
              className="song-play-control"
              aria-label={`Play ${songTitle}`}
              onClick={(event) => playSong(event, song)}
            >
              <i className="song-play-indicator fas fa-play" aria-hidden="true" />
            </button>
          ) : isPlaying ? (
            <i className="song-play-indicator fas fa-play" aria-hidden="true" />
          ) : null}
          {songTitle}
        </span>
        {isExpanded ? renderTrackActions(song, songTitle, songSrc, favoriteClass) : null}
      </li>
    );
  };

  const renderAlbumRow = (album) => {
    const isExpanded = expandedAlbumId === album.id;
    const isActive = album.tracks.indexOf(currentlyPlayingPath) !== -1;
    const trackLabel =
      album.tracks.length === 1 ? '1 track' : `${album.tracks.length} tracks`;
    const rowClass = [
      'single-song-wrapper',
      'single-song-wrapper--album',
      isExpanded ? 'expanded' : null,
      isActive ? 'active' : null,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <li
        className={'album-group' + (isExpanded ? ' album-group--expanded' : '')}
        key={`album-${album.id}`}
      >
        <div
          className={rowClass}
          onClick={() => toggleAlbum(album.id)}
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggleAlbum(album.id);
            }
          }}
        >
          <span className="title">
            {isActive ? (
              <i className="song-play-indicator fas fa-play" aria-hidden="true" />
            ) : (
              <i
                className={
                  'album-expand-indicator fas fa-' + (isExpanded ? 'minus' : 'plus')
                }
                aria-hidden="true"
              />
            )}
            {album.title}
          </span>
          <span className="album-track-count">{trackLabel}</span>
        </div>
        {isExpanded ? (
          <ul className="songlist--album-tracks">
            {album.tracks.map((track) => renderTrackRow(track, { nested: true }))}
          </ul>
        ) : null}
      </li>
    );
  };

  const displayRows = buildDisplayRows(songList, albums || []);

  return (
    <div className="body-content">
      <div className="total-songs">
        {songList.length > 0 ? `${songList.length} songs` : null}
      </div>
      <ul className="songlist">
        {displayRows.map((row) =>
          row.type === 'album'
            ? renderAlbumRow(row.album)
            : renderTrackRow(row.path)
        )}
      </ul>
    </div>
  );
}
