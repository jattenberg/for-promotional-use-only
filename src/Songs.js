import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import AudioPlayer from 'react-responsive-audio-player';
import Collapse from '@material-ui/core/Collapse';
import {
  compareSongsForDisplay,
  mediaUrl,
  prepareSongForDisplay,
} from './songUtils';

const POSITION_FLUSH_MS = 5000;

class Songs extends Component {
  state = {
    currentlyPlayingPath: null,
    seekToSeconds: 0,
  }

  componentDidMount() {
    this.applyPendingPlay(this.props.pendingPlay);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.pendingPlay !== this.props.pendingPlay) {
      this.applyPendingPlay(this.props.pendingPlay);
    }
  }

  applyPendingPlay = (pendingPlay) => {
    const { songList, onPendingPlayConsumed } = this.props;
    if (!pendingPlay || !pendingPlay.path) {
      return;
    }
    if (!songList || songList.indexOf(pendingPlay.path) === -1) {
      if (onPendingPlayConsumed) {
        onPendingPlayConsumed();
      }
      return;
    }
    this.setState({
      currentlyPlayingPath: pendingPlay.path,
      seekToSeconds:
        typeof pendingPlay.seekTo === 'number' && pendingPlay.seekTo > 0
          ? pendingPlay.seekTo
          : 0,
    });
    if (onPendingPlayConsumed) {
      onPendingPlayConsumed();
    }
  }

  setCurrentlyPlayingSong = (path) => {
    this.setState({ currentlyPlayingPath: path, seekToSeconds: 0 });
  }

  setNothingPlaying = () => {
    this.setState({ currentlyPlayingPath: null, seekToSeconds: 0 });
  }

  setNextSong = (index, sortedSongList) => {
    const next = sortedSongList[index + 1];
    if (next) {
      this.setCurrentlyPlayingSong(next);
    } else {
      this.setNothingPlaying();
    }
  }

  setPreviousSong = (index, sortedSongList) => {
    const previous = sortedSongList[index - 1];
    if (previous) {
      this.setCurrentlyPlayingSong(previous);
    } else {
      this.setNothingPlaying();
    }
  }

  clearSeek = () => {
    if (this.state.seekToSeconds) {
      this.setState({ seekToSeconds: 0 });
    }
  }

  renderSong = (song, index, sortedSongList) => {
    const {
      songList,
      toggleAddRemoveFavorites,
      favorites,
      recordPlayed,
      updatePlaybackPosition,
    } = this.props;

    return (
      <SingleSong
        songList={songList}
        favorites={favorites}
        toggleAddRemoveFavorites={toggleAddRemoveFavorites}
        recordPlayed={recordPlayed}
        updatePlaybackPosition={updatePlaybackPosition}
        onNext={() => this.setNextSong(index, sortedSongList)}
        onPrevious={() => this.setPreviousSong(index, sortedSongList)}
        currentlyPlayingPath={this.state.currentlyPlayingPath}
        seekToSeconds={
          this.state.currentlyPlayingPath === song ? this.state.seekToSeconds : 0
        }
        onSeekApplied={this.clearSeek}
        setNothingPlaying={this.setNothingPlaying}
        setCurrentlyPlayingSong={this.setCurrentlyPlayingSong}
        song={song}
        key={song + "-" + index}
        index={index} />
    );
  }

  render = () => {
    const { songList } = this.props;
    const sortedSongList = [...songList].sort(compareSongsForDisplay);
    return (
      <React.Fragment>
        <div className="body-content">
          <div className="total-songs">
            {sortedSongList.length > 0 ? sortedSongList.length + " songs" : null}
          </div>
          <ul className="songlist">
            {sortedSongList.map((song, index) =>
              this.renderSong(song, index, sortedSongList)
            )}
          </ul>
        </div>
      </React.Fragment>
    )
  }
}


class SingleSong extends Component {
  state = {
    unfurled: false
  }

  handleUnfurl = () => {
    this.setState(state => ({ unfurled: !state.unfurled }));
  }

  formatSongTitle = (song) => {
    return prepareSongForDisplay(song);
  }

  toggleDisplaySong = () => {
    const { setNothingPlaying, setCurrentlyPlayingSong, song, currentlyPlayingPath } = this.props;
    if (currentlyPlayingPath === song) {
      setNothingPlaying();
    } else {
      setCurrentlyPlayingSong(song);
    }
  }

  stopChildClickPropagation = (e) => {
    e.stopPropagation();
  }

  shouldRenderAudioPlayer = () => {
    const { song, currentlyPlayingPath } = this.props;
    return currentlyPlayingPath === song;
  }

  renderFavoritesCSS = (songPath) => {
    const { favorites } = this.props;
    let favoriteClass;
    if (favorites.hasOwnProperty(songPath)) {
        favoriteClass = "favorite fas fa-star already-favorited";
    } else {
        favoriteClass = "favorite far fa-star";
    }
    return ( favoriteClass )
  }

  handlePlay = (songPath) => {
    const { recordPlayed } = this.props;
    recordPlayed(songPath);
  }

  audioFromEvent = (e) => {
    if (e && e.target) {
      return e.target;
    }
    return null;
  }

  flushPosition = (songPath, e, { ended } = { ended: false }) => {
    const { updatePlaybackPosition } = this.props;
    if (!updatePlaybackPosition) {
      return;
    }
    const audio = this.audioFromEvent(e);
    if (!audio) {
      return;
    }
    if (ended) {
      updatePlaybackPosition(songPath, 0, audio.duration);
      return;
    }
    updatePlaybackPosition(songPath, audio.currentTime, audio.duration);
  }

  handleTimeUpdate = (songPath, e) => {
    const now = Date.now();
    if (this._lastPosWrite && now - this._lastPosWrite < POSITION_FLUSH_MS) {
      return;
    }
    this._lastPosWrite = now;
    this.flushPosition(songPath, e);
  }

  handleLoadedMetadata = (e) => {
    const { seekToSeconds, onSeekApplied } = this.props;
    const audio = this.audioFromEvent(e);
    if (!audio || !seekToSeconds || seekToSeconds <= 0) {
      return;
    }
    const duration = Number(audio.duration);
    const capped =
      Number.isFinite(duration) && duration > 0
        ? Math.min(seekToSeconds, Math.max(duration - 0.25, 0))
        : seekToSeconds;
    audio.currentTime = capped;
    if (onSeekApplied) {
      onSeekApplied();
    }
  }

  playPreviousTrack = () =>  {
    const { onPrevious } = this.props;
    onPrevious();
  }

  playNextTrack = () =>  {
    const { onNext } = this.props;
    onNext();
  }

  // B3 will replace this player; v1.3.1 exposes no onNext/onPrevious props.
  getAudioPlayerRef = (ref) =>  {
    if (this.audioPlayerRef) {
      const audioPlayerDOM = ReactDOM.findDOMNode(this.audioPlayerRef);
      const [previousButton, nextButton] = audioPlayerDOM.querySelectorAll('.skip_button');
      previousButton.removeEventListener('click', this.playPreviousTrack);
      nextButton.removeEventListener('click', this.playNextTrack);
    }

    this.audioPlayerRef = ref;

    if (ref) {
      const audioPlayerDOM = ReactDOM.findDOMNode(ref);
      const [previousButton, nextButton] = audioPlayerDOM.querySelectorAll('.skip_button');
      previousButton.addEventListener('click', this.playPreviousTrack);
      nextButton.addEventListener('click', this.playNextTrack);
    }
  }

  renderAudioPlayer = (playlist, song) =>  {
    const stopChildClickPropagation = this.stopChildClickPropagation;
    const { toggleAddRemoveFavorites } = this.props;
    const songSrc = playlist[0].url;
    return (
      <div className="relative">
        <div className="" onClick={ stopChildClickPropagation }>
          <AudioPlayer autoplay autoplayDelayInSeconds={0.5} ref={this.getAudioPlayerRef} cycle={false} playlist={playlist}
                       onMediaEvent={{
                         play: () => this.handlePlay(song),
                         timeupdate: (e) => this.handleTimeUpdate(song, e),
                         pause: (e) => this.flushPosition(song, e),
                         ended: (e) => this.flushPosition(song, e, { ended: true }),
                         loadedmetadata: (e) => this.handleLoadedMetadata(e),
                       }}
          />
        </div>
        <div className="clearfix favorite-download" onClick={ stopChildClickPropagation }>
          <i className={ this.renderFavoritesCSS(song) }
             onClick={ () => toggleAddRemoveFavorites(song)}></i>
          <a href={songSrc}>
            <i className="download fas fa-download"></i>
          </a>
        </div>
      </div>
    )
  }

  render = () => {
    const { song } = this.props;
    let songTitle = this.formatSongTitle(song);

    let url = mediaUrl(song);
    let playlist = [{url: url, title: songTitle}];

    return (
      <li
        className={"single-song-wrapper " + (this.shouldRenderAudioPlayer() ? "active" : "")}
        key={song}
        onClick={ () => this.toggleDisplaySong() }
        >
        <span className="title">{songTitle}</span>
          <Collapse in={this.shouldRenderAudioPlayer()} unmountOnExit timeout={{enter:300, exit:500}}>
            { this.renderAudioPlayer(playlist,song)}
          </Collapse>
      </li>
    )
  }

}

export default Songs;
