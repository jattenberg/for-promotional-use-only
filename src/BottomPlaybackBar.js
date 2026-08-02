import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import AudioPlayer from 'react-responsive-audio-player';
import { mediaUrl, prepareSongForDisplay } from './songUtils';

const POSITION_FLUSH_MS = 2000;

/**
 * Fixed bottom playback bar. Owns the audio element, seek application, and
 * position flushing for the currently loaded track.
 */
class BottomPlaybackBar extends Component {
  constructor(props) {
    super(props);
    this.audioEl = null;
    this.audioPlayerRef = null;
    this._didSeek = false;
    this._lastPosWrite = 0;
    this._seekListener = null;
    this.state = {
      isPlaying: false,
    };
  }

  componentDidUpdate(prevProps) {
    if (prevProps.currentPath !== this.props.currentPath) {
      this._didSeek = false;
      this.setState({ isPlaying: false });
    }
    if (
      this.props.seekToSeconds > 0 &&
      !this._didSeek &&
      this.audioEl
    ) {
      this.trySeek(this.audioEl);
    }
  }

  componentWillUnmount() {
    this.detachSkipHandlers();
  }

  favoriteClassName = (songPath) => {
    const { favorites } = this.props;
    if (favorites && favorites.hasOwnProperty(songPath)) {
      return 'favorite fas fa-star already-favorited';
    }
    return 'favorite far fa-star';
  }

  handlePlay = () => {
    const { currentPath, recordPlayed } = this.props;
    this.setState({ isPlaying: true });
    if (currentPath && recordPlayed) {
      recordPlayed(currentPath);
    }
  }

  handlePause = (e) => {
    this.setState({ isPlaying: false });
    this.flushPosition(e);
  }

  flushFromElement = (audio, { ended } = { ended: false }) => {
    const { updatePlaybackPosition, currentPath, seekToSeconds } = this.props;
    if (!updatePlaybackPosition || !audio || !currentPath) {
      return;
    }
    if (seekToSeconds > 0 && !this._didSeek && !ended) {
      return;
    }
    if (ended) {
      updatePlaybackPosition(currentPath, 0, audio.duration);
      return;
    }
    const position = Number(audio.currentTime);
    if (!Number.isFinite(position) || position < 0) {
      return;
    }
    updatePlaybackPosition(currentPath, position, audio.duration);
  }

  audioFromEvent = (e) => {
    if (e && e.target) {
      return e.target;
    }
    return this.audioEl;
  }

  flushPosition = (e, { ended } = { ended: false }) => {
    this.flushFromElement(this.audioFromEvent(e), { ended });
  }

  handleTimeUpdate = (e) => {
    const now = Date.now();
    if (this._lastPosWrite && now - this._lastPosWrite < POSITION_FLUSH_MS) {
      return;
    }
    this._lastPosWrite = now;
    this.flushPosition(e);
  }

  handleEnded = (e) => {
    this.setState({ isPlaying: false });
    this.flushPosition(e, { ended: true });
    const { onNext } = this.props;
    if (onNext) {
      onNext();
    }
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

  detachSkipHandlers = () => {
    if (!this.audioPlayerRef) {
      return;
    }
    const audioPlayerDOM = ReactDOM.findDOMNode(this.audioPlayerRef);
    if (!audioPlayerDOM) {
      return;
    }
    const buttons = audioPlayerDOM.querySelectorAll('.skip_button');
    if (buttons[0]) {
      buttons[0].removeEventListener('click', this.handlePreviousClick);
    }
    if (buttons[1]) {
      buttons[1].removeEventListener('click', this.handleNextClick);
    }
  }

  handlePreviousClick = () => {
    const { onPrevious } = this.props;
    if (onPrevious) {
      onPrevious();
    }
  }

  handleNextClick = () => {
    const { onNext } = this.props;
    if (onNext) {
      onNext();
    }
  }

  getAudioPlayerRef = (ref) => {
    this.detachSkipHandlers();
    this.audioPlayerRef = ref;
    if (ref) {
      const audioPlayerDOM = ReactDOM.findDOMNode(ref);
      const [previousButton, nextButton] = audioPlayerDOM.querySelectorAll(
        '.skip_button'
      );
      if (previousButton) {
        previousButton.addEventListener('click', this.handlePreviousClick);
      }
      if (nextButton) {
        nextButton.addEventListener('click', this.handleNextClick);
      }
    }
  }

  renderIdle = () => {
    return (
      <div className="bottom-playback-bar bottom-playback-bar--idle" role="region" aria-label="Playback">
        <div className="bottom-playback-bar__title">No track selected</div>
        <div className="bottom-playback-bar__idle-hint">
          Choose a mixtape to start playback
        </div>
      </div>
    );
  }

  renderEqualizer = () => {
    const { isPlaying } = this.state;
    return (
      <div
        className={
          'bottom-playback-eq' + (isPlaying ? ' bottom-playback-eq--playing' : '')
        }
        aria-hidden="true"
      >
        <span />
        <span />
        <span />
        <span />
      </div>
    );
  }

  renderLoaded = () => {
    const {
      currentPath,
      seekToSeconds,
      toggleAddRemoveFavorites,
    } = this.props;
    const songTitle = prepareSongForDisplay(currentPath);
    const songSrc = mediaUrl(currentPath);
    const playlist = [{ url: songSrc, title: songTitle }];
    const resuming = seekToSeconds > 0;

    return (
      <div className="bottom-playback-bar" role="region" aria-label="Now playing">
        <div className="bottom-playback-bar__meta">
          {this.renderEqualizer()}
          <div className="bottom-playback-bar__title" title={songTitle}>
            {songTitle}
          </div>
          <div className="bottom-playback-bar__actions">
            <i
              className={this.favoriteClassName(currentPath)}
              onClick={() => toggleAddRemoveFavorites(currentPath)}
              role="button"
              aria-label="Toggle favorite"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleAddRemoveFavorites(currentPath);
                }
              }}
            />
            <a href={songSrc} aria-label="Download track">
              <i className="download fas fa-download" />
            </a>
          </div>
        </div>
        <div className="bottom-playback-bar__player">
          <AudioPlayer
            key={currentPath}
            autoplay
            autoplayDelayInSeconds={resuming ? 0 : 0.5}
            ref={this.getAudioPlayerRef}
            audioElementRef={this.setAudioElementRef}
            cycle={false}
            playlist={playlist}
            onMediaEvent={{
              play: this.handlePlay,
              timeupdate: this.handleTimeUpdate,
              pause: this.handlePause,
              ended: this.handleEnded,
            }}
          />
        </div>
      </div>
    );
  }

  render() {
    const { currentPath } = this.props;
    if (!currentPath) {
      return this.renderIdle();
    }
    return this.renderLoaded();
  }
}

export default BottomPlaybackBar;
