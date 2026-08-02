import React, { Component } from 'react';
import {
  compareSongsForDisplay,
  mediaUrl,
  prepareSongForDisplay,
} from './songUtils';

/**
 * Declarative playlist view. Row click expands actions; play starts playback.
 */
class Songs extends Component {
  state = {
    expandedPath: null,
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

  renderSong = (song) => {
    const {
      toggleAddRemoveFavorites,
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
        {isExpanded ? (
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
