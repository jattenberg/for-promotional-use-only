import React, { Component } from 'react';
import {
  compareSongsForDisplay,
  mediaUrl,
  prepareSongForDisplay,
} from './songUtils';

/**
 * Declarative playlist view. Reports track selections; does not own playback.
 */
class Songs extends Component {
  renderSong = (song) => {
    const {
      toggleAddRemoveFavorites,
      favorites,
      currentlyPlayingPath,
      onSelectTrack,
    } = this.props;
    const isActive = currentlyPlayingPath === song;
    const songTitle = prepareSongForDisplay(song);
    const songSrc = mediaUrl(song);
    const favoriteClass =
      favorites && favorites.hasOwnProperty(song)
        ? 'favorite fas fa-star already-favorited'
        : 'favorite far fa-star';

    return (
      <li
        className={
          'single-song-wrapper' + (isActive ? ' active' : '')
        }
        key={song}
        onClick={() => onSelectTrack(song)}
      >
        <span className="title">
          {isActive ? (
            <i className="song-play-indicator fa fa-play" aria-hidden="true" />
          ) : null}
          {songTitle}
        </span>
        {isActive ? (
          <div
            className="clearfix favorite-download favorite-download--row"
            onClick={(e) => e.stopPropagation()}
          >
            <i
              className={favoriteClass}
              onClick={() => toggleAddRemoveFavorites(song)}
              role="button"
              aria-label="Toggle favorite"
            />
            <a href={songSrc} aria-label="Download track">
              <i className="download fas fa-download" />
            </a>
          </div>
        ) : null}
      </li>
    );
  }

  render() {
    const { songList } = this.props;
    const sortedSongList = [...songList].sort(compareSongsForDisplay);
    return (
      <div className="body-content">
        <div className="total-songs">
          {sortedSongList.length > 0 ? sortedSongList.length + ' songs' : null}
        </div>
        <ul className="songlist">
          {sortedSongList.map((song) => this.renderSong(song))}
        </ul>
      </div>
    );
  }
}

export default Songs;
