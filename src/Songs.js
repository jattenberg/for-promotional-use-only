import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import AudioPlayer from 'react-responsive-audio-player';
import Collapse from '@material-ui/core/Collapse';
import {
  compareSongsForDisplay,
  mediaUrl,
  prepareSongForDisplay,
} from './songUtils';

const POSITION_FLUSH_MS = 2000;

class Songs extends Component {
  state = {
    currentlyPlayingPath: null,
    seekToSeconds: 0,
  }

  componentDidMount() {
    this.applyPendingPlay(this.props.pendingPlay);
  }

  componentDidUpdate(prevProps) {
    const pendingChanged = prevProps.pendingPlay !== this.props.pendingPlay;
    const listChanged = prevProps.songList !== this.props.songList;
    if (pendingChanged || (listChanged && this.props.pendingPlay)) {
      this.applyPendingPlay(this.props.pendingPlay);
    }
  }

  applyPendingPlay = (pendingPlay) => {
    const { songList, onPendingPlayConsumed } = this.props;
    if (!pendingPlay || !pendingPlay.path) {
      return;
    }
    // Cross-letter play briefly keeps the old letter's songList while navigation
    // loads the target letter. Leave pendingPlay in App until the path appears.
    if (!songList || songList.indexOf(pendingPlay.path) === -1) {
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
      toggleAddRemoveFavorites,
      favorites,
      recordPlayed,
      updatePlaybackPosition,
    } = this.props;

    return (
      <SingleSong
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
  constructor(props) {
    super(props);
    this.audioEl = null;
    this._didSeek = false;
    this._lastPosWrite = 0;
    this._seekListener = null;
  }

  componentDidUpdate(prevProps) {
    if (prevProps.song !== this.props.song) {
      this._didSeek = false;
    }
    if (
      this.props.seekToSeconds > 0 &&
      !this._didSeek &&
      this.audioEl
    ) {
      this.trySeek(this.audioEl);
    }
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

  flushFromElement = (audio, { ended } = { ended: false }) => {
    const { updatePlaybackPosition, song } = this.props;
    if (!updatePlaybackPosition || !audio) {
      return;
    }
    // Avoid clobbering a saved resume offset with t≈0 before seek applies.
    if (this.props.seekToSeconds > 0 && !this._didSeek && !ended) {
      return;
    }
    if (ended) {
      updatePlaybackPosition(song, 0, audio.duration);
      return;
    }
    const position = Number(audio.currentTime);
    if (!Number.isFinite(position) || position < 0) {
      return;
    }
    updatePlaybackPosition(song, position, audio.duration);
  }

  audioFromEvent = (e) => {
    if (e && e.target) {
      return e.target;
    }
    return this.audioEl;
  }

  flushPosition = (songPath, e, { ended } = { ended: false }) => {
    this.flushFromElement(this.audioFromEvent(e), { ended });
  }

  handleTimeUpdate = (songPath, e) => {
    const now = Date.now();
    if (this._lastPosWrite && now - this._lastPosWrite < POSITION_FLUSH_MS) {
      return;
    }
    this._lastPosWrite = now;
    this.flushPosition(songPath, e);
  }

  trySeek = (audio) => {
    const { seekToSeconds, onSeekApplied } = this.props;
    if (!audio || this._didSeek || !seekToSeconds || seekToSeconds <= 0) {
      return;
    }
    const applySeek = () => {
      if (this._didSeek || !this.audioEl) {
        return;
      }
      if (audio.readyState < 1) {
        return;
      }
      const duration = Number(audio.duration);
      const capped =
        Number.isFinite(duration) && duration > 0
          ? Math.min(seekToSeconds, Math.max(duration - 0.25, 0))
          : seekToSeconds;
      try {
        audio.currentTime = capped;
      } catch (err) {
        return;
      }
      this._didSeek = true;
      if (this._seekListener) {
        audio.removeEventListener('loadedmetadata', this._seekListener);
        audio.removeEventListener('canplay', this._seekListener);
        this._seekListener = null;
      }
      // Ensure playback continues from the resumed offset (autoplay may have
      // started at 0 before metadata was ready).
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
      if (onSeekApplied) {
        onSeekApplied();
      }
    };

    if (audio.readyState >= 1) {
      applySeek();
      return;
    }

    if (!this._seekListener) {
      this._seekListener = applySeek;
      audio.addEventListener('loadedmetadata', this._seekListener);
      audio.addEventListener('canplay', this._seekListener);
    }
  }

  setAudioElementRef = (audio) => {
    if (!audio && this.audioEl) {
      // Player is tearing down; its own pause() runs after listeners are removed,
      // so flush here while we still have the element.
      this.flushFromElement(this.audioEl);
      if (this._seekListener) {
        this.audioEl.removeEventListener('loadedmetadata', this._seekListener);
        this.audioEl.removeEventListener('canplay', this._seekListener);
        this._seekListener = null;
      }
    }
    this.audioEl = audio;
    if (audio) {
      this._didSeek = false;
      this.trySeek(audio);
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
      if (audioPlayerDOM) {
        const buttons = audioPlayerDOM.querySelectorAll('.skip_button');
        if (buttons[0]) {
          buttons[0].removeEventListener('click', this.playPreviousTrack);
        }
        if (buttons[1]) {
          buttons[1].removeEventListener('click', this.playNextTrack);
        }
      }
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
    const { toggleAddRemoveFavorites, seekToSeconds } = this.props;
    const songSrc = playlist[0].url;
    const resuming = seekToSeconds > 0;
    return (
      <div className="relative">
        <div className="" onClick={ stopChildClickPropagation }>
          <AudioPlayer
            autoplay
            autoplayDelayInSeconds={resuming ? 0 : 0.5}
            ref={this.getAudioPlayerRef}
            audioElementRef={this.setAudioElementRef}
            cycle={false}
            playlist={playlist}
            onMediaEvent={{
              play: () => this.handlePlay(song),
              timeupdate: (e) => this.handleTimeUpdate(song, e),
              pause: (e) => this.flushPosition(song, e),
              ended: (e) => this.flushPosition(song, e, { ended: true }),
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
