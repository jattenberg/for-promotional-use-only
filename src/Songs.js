import React, { Component } from 'react';
import {
  buildDisplayRows,
  mediaUrl,
  prepareSongForDisplay,
} from './songUtils';

/**
 * Declarative playlist view. Album parents expand to tracks; row click expands
 * play/favorite/download; play starts playback.
 */
class Songs extends Component {
  state = {
    expandedAlbumId: null,
    expandedPath: null,
  }

  toggleAlbum = (albumId) => {
    this.setState((state) => ({
      expandedAlbumId: state.expandedAlbumId === albumId ? null : albumId,
    }));
  }

  expandSong = (songPath) => {
    this.setState((state) => ({
      expandedPath: state.expandedPath === songPath ? null : songPath,
    }));
  }

  playSong = (event, songPath) => {
    event.stopPropagation();
    const { onSelectTrack } = this.props;
    if (onSelectTrack) {
      onSelectTrack(songPath);
    }
  }

  renderTrackActions = (song, songTitle, songSrc, favoriteClass) => {
    const { toggleAddRemoveFavorites } = this.props;
    return (
      <div
        className="clearfix favorite-download favorite-download--row"
        onClick={(e) => e.stopPropagation()}
      >
        <i
          className={favoriteClass}
          onClick={() => toggleAddRemoveFavorites(song)}
          role="button"
          aria-label="Toggle favorite"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleAddRemoveFavorites(song);
            }
          }}
        />
        <a href={songSrc} aria-label="Download track">
          <i className="download fas fa-download" />
        </a>
      </div>
    );
  }

  renderTrackRow = (song, { nested } = { nested: false }) => {
    const {
      favorites,
      currentlyPlayingPath,
    } = this.props;
    const { expandedPath } = this.state;
    const isExpanded = expandedPath === song;
    const isPlaying = currentlyPlayingPath === song;
    const songTitle = prepareSongForDisplay(song);
    const songSrc = mediaUrl(song);
    const favoriteClass =
      favorites && favorites.hasOwnProperty(song)
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
      <li
        className={rowClass}
        key={song}
        onClick={() => this.expandSong(song)}
      >
        <span className="title">
          {isExpanded ? (
            <button
              type="button"
              className="song-play-control"
              aria-label={`Play ${songTitle}`}
              onClick={(event) => this.playSong(event, song)}
            >
              <i className="song-play-indicator fa fa-play" aria-hidden="true" />
            </button>
          ) : isPlaying ? (
            <i className="song-play-indicator fa fa-play" aria-hidden="true" />
          ) : null}
          {songTitle}
        </span>
        {isExpanded
          ? this.renderTrackActions(song, songTitle, songSrc, favoriteClass)
          : null}
      </li>
    );
  }

  renderAlbumRow = (album) => {
    const { currentlyPlayingPath } = this.props;
    const { expandedAlbumId } = this.state;
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
      <li className="album-group" key={`album-${album.id}`}>
        <div
          className={rowClass}
          onClick={() => this.toggleAlbum(album.id)}
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              this.toggleAlbum(album.id);
            }
          }}
        >
          <span className="title">
            {isActive ? (
              <i className="song-play-indicator fa fa-play" aria-hidden="true" />
            ) : (
              <i
                className={
                  'album-expand-indicator fa fa-' + (isExpanded ? 'minus' : 'plus')
                }
                aria-hidden="true"
              />
            )}
            {album.title}
          </span>
          <span className="album-track-count">{trackLabel}</span>
        </div>
        {isExpanded ? (
          <ul className="songlist songlist--album-tracks">
            {album.tracks.map((track) =>
              this.renderTrackRow(track, { nested: true })
            )}
          </ul>
        ) : null}
      </li>
    );
  }

  render() {
    const { songList } = this.props;
    const displayRows = buildDisplayRows(songList, this.props.albums);
    return (
      <div className="body-content">
        <div className="total-songs">
          {songList.length > 0 ? songList.length + ' songs' : null}
        </div>
        <ul className="songlist">
          {displayRows.map((row) =>
            row.type === 'album'
              ? this.renderAlbumRow(row.album)
              : this.renderTrackRow(row.path)
          )}
        </ul>
      </div>
    );
  }
}

export default Songs;
