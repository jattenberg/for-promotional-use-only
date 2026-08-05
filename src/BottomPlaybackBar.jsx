import { useCallback, useEffect, useRef, useState } from 'react';
import AudioPlayer from 'react-responsive-audio-player';
import { mediaUrl, prepareSongForDisplay } from './songUtils';

const POSITION_FLUSH_MS = 2000;

/**
 * Fixed bottom playback bar. Owns the audio element, seek application, and
 * position flushing for the currently loaded track.
 */
export default function BottomPlaybackBar({
  currentPath,
  seekToSeconds,
  favorites,
  toggleAddRemoveFavorites,
  recordPlayed,
  updatePlaybackPosition,
  onSeekApplied,
  onNext,
  onPrevious,
}) {
  const audioEl = useRef(null);
  const audioElPath = useRef(null);
  const audioPlayerRef = useRef(null);
  const didSeek = useRef(false);
  const lastPosWrite = useRef(0);
  const seekListener = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePreviousClick = useCallback(() => {
    if (onPrevious) {
      onPrevious();
    }
  }, [onPrevious]);

  const handleNextClick = useCallback(() => {
    if (onNext) {
      onNext();
    }
  }, [onNext]);

  const detachSkipHandlers = useCallback(() => {
    const node = audioPlayerRef.current;
    if (!node) {
      return;
    }
    const buttons = node.querySelectorAll('.skip_button');
    if (buttons[0]) {
      buttons[0].removeEventListener('click', handlePreviousClick);
    }
    if (buttons[1]) {
      buttons[1].removeEventListener('click', handleNextClick);
    }
  }, [handleNextClick, handlePreviousClick]);

  const attachSkipHandlers = useCallback(
    (node) => {
      detachSkipHandlers();
      audioPlayerRef.current = node;
      if (!node) {
        return;
      }
      const buttons = node.querySelectorAll('.skip_button');
      if (buttons[0]) {
        buttons[0].addEventListener('click', handlePreviousClick);
      }
      if (buttons[1]) {
        buttons[1].addEventListener('click', handleNextClick);
      }
    },
    [detachSkipHandlers, handleNextClick, handlePreviousClick]
  );

  useEffect(() => () => detachSkipHandlers(), [detachSkipHandlers]);

  useEffect(() => {
    didSeek.current = false;
    setIsPlaying(false);
  }, [currentPath]);

  const flushFromElement = useCallback(
    (audio, { ended } = { ended: false }) => {
      const trackPath = audioElPath.current || currentPath;
      if (!updatePlaybackPosition || !audio || !trackPath) {
        return;
      }
      const awaitingSeek =
        trackPath === currentPath && seekToSeconds > 0 && !didSeek.current;
      if (awaitingSeek && !ended) {
        return;
      }
      if (ended) {
        updatePlaybackPosition(trackPath, 0, audio.duration);
        return;
      }
      const position = Number(audio.currentTime);
      if (!Number.isFinite(position) || position < 0) {
        return;
      }
      updatePlaybackPosition(trackPath, position, audio.duration);
    },
    [currentPath, seekToSeconds, updatePlaybackPosition]
  );

  const audioFromEvent = useCallback((event) => {
    if (event && event.target) {
      return event.target;
    }
    return audioEl.current;
  }, []);

  const flushPosition = useCallback(
    (event, { ended } = { ended: false }) => {
      flushFromElement(audioFromEvent(event), { ended });
    },
    [audioFromEvent, flushFromElement]
  );

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    if (currentPath && recordPlayed) {
      recordPlayed(currentPath);
    }
  }, [currentPath, recordPlayed]);

  const handlePause = useCallback(
    (event) => {
      setIsPlaying(false);
      flushPosition(event);
    },
    [flushPosition]
  );

  const handleTimeUpdate = useCallback(
    (event) => {
      const now = Date.now();
      if (lastPosWrite.current && now - lastPosWrite.current < POSITION_FLUSH_MS) {
        return;
      }
      lastPosWrite.current = now;
      flushPosition(event);
    },
    [flushPosition]
  );

  const handleEnded = useCallback(
    (event) => {
      setIsPlaying(false);
      flushPosition(event, { ended: true });
      if (onNext) {
        onNext();
      }
    },
    [flushPosition, onNext]
  );

  const trySeek = useCallback(
    (audio) => {
      if (!audio || didSeek.current || !seekToSeconds || seekToSeconds <= 0) {
        return;
      }
      const applySeek = () => {
        if (didSeek.current || !audioEl.current) {
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
        } catch {
          return;
        }
        didSeek.current = true;
        if (seekListener.current) {
          audio.removeEventListener('loadedmetadata', seekListener.current);
          audio.removeEventListener('canplay', seekListener.current);
          seekListener.current = null;
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

      if (!seekListener.current) {
        seekListener.current = applySeek;
        audio.addEventListener('loadedmetadata', seekListener.current);
        audio.addEventListener('canplay', seekListener.current);
      }
    },
    [onSeekApplied, seekToSeconds]
  );

  const setAudioElementRef = useCallback(
    (audio) => {
      if (!audio && audioEl.current) {
        flushFromElement(audioEl.current);
        if (seekListener.current) {
          audioEl.current.removeEventListener('loadedmetadata', seekListener.current);
          audioEl.current.removeEventListener('canplay', seekListener.current);
          seekListener.current = null;
        }
      }
      audioEl.current = audio;
      if (audio) {
        audioElPath.current = currentPath;
        didSeek.current = false;
        trySeek(audio);
      }
    },
    [currentPath, flushFromElement, trySeek]
  );

  useEffect(() => {
    if (seekToSeconds > 0 && !didSeek.current && audioEl.current) {
      trySeek(audioEl.current);
    }
  }, [seekToSeconds, trySeek]);

  const favoriteClassName = (songPath) => {
    if (favorites && Object.prototype.hasOwnProperty.call(favorites, songPath)) {
      return 'favorite fas fa-star already-favorited';
    }
    return 'favorite far fa-star';
  };

  if (!currentPath) {
    return (
      <div
        className="bottom-playback-bar bottom-playback-bar--idle"
        role="region"
        aria-label="Playback"
      >
        <div className="bottom-playback-bar__title">No track selected</div>
        <div className="bottom-playback-bar__idle-hint">
          Choose a mixtape to start playback
        </div>
      </div>
    );
  }

  const songTitle = prepareSongForDisplay(currentPath);
  const songSrc = mediaUrl(currentPath);
  const playlist = [{ url: songSrc, title: songTitle }];
  const resuming = seekToSeconds > 0;

  return (
    <div className="bottom-playback-bar" role="region" aria-label="Now playing">
      <div className="bottom-playback-bar__meta">
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
        <div className="bottom-playback-bar__title" title={songTitle}>
          {songTitle}
        </div>
        <div className="bottom-playback-bar__actions">
          <i
            className={favoriteClassName(currentPath)}
            onClick={() => toggleAddRemoveFavorites(currentPath)}
            role="button"
            aria-label="Toggle favorite"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
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
          ref={attachSkipHandlers}
          audioElementRef={setAudioElementRef}
          cycle={false}
          playlist={playlist}
          onMediaEvent={{
            play: handlePlay,
            timeupdate: handleTimeUpdate,
            pause: handlePause,
            ended: handleEnded,
          }}
        />
      </div>
    </div>
  );
}
