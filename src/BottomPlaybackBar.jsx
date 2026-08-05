import { useCallback, useEffect, useRef, useState } from 'react';
import { getEventLogger } from './events';
import { mediaUrl, prepareSongForDisplay } from './songUtils';

const POSITION_FLUSH_MS = 2000;
const AUTOPLAY_DELAY_MS = 500;

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

/**
 * Fixed bottom playback bar. Owns a native audio element, seek application, and
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
  const didSeek = useRef(false);
  const lastPosWrite = useRef(0);
  const seekListener = useRef(null);
  const seekToSecondsRef = useRef(seekToSeconds);
  const trySeekRef = useRef(null);
  const flushFromElementRef = useRef(null);
  seekToSecondsRef.current = seekToSeconds;
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    didSeek.current = false;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
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
  flushFromElementRef.current = flushFromElement;

  const flushPosition = useCallback(
    (event, { ended } = { ended: false }) => {
      const audio = event?.target || audioEl.current;
      flushFromElement(audio, { ended });
    },
    [flushFromElement]
  );

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    if (currentPath && recordPlayed) {
      recordPlayed(currentPath);
    }
    if (currentPath) {
      getEventLogger().track(
        'play_started',
        { song_path: currentPath },
        typeof location !== 'undefined' ? location.pathname : '/'
      );
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
      const audio = event.target;
      setCurrentTime(audio.currentTime);
      if (Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
      const now = Date.now();
      if (lastPosWrite.current && now - lastPosWrite.current < POSITION_FLUSH_MS) {
        return;
      }
      lastPosWrite.current = now;
      flushPosition(event);
    },
    [flushPosition]
  );

  const handleLoadedMetadata = useCallback((event) => {
    const audio = event.target;
    if (Number.isFinite(audio.duration)) {
      setDuration(audio.duration);
    }
  }, []);

  const handleEnded = useCallback(
    (event) => {
      setIsPlaying(false);
      flushPosition(event, { ended: true });
      const trackPath = audioElPath.current || currentPath;
      if (trackPath) {
        getEventLogger().track(
          'play_completed',
          { song_path: trackPath },
          typeof location !== 'undefined' ? location.pathname : '/'
        );
      }
      if (onNext) {
        onNext();
      }
    },
    [currentPath, flushPosition, onNext]
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
        const audioDuration = Number(audio.duration);
        const capped =
          Number.isFinite(audioDuration) && audioDuration > 0
            ? Math.min(seekToSeconds, Math.max(audioDuration - 0.25, 0))
            : seekToSeconds;
        try {
          audio.currentTime = capped;
          setCurrentTime(capped);
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
  trySeekRef.current = trySeek;

  useEffect(() => {
    const audio = audioEl.current;
    if (!audio) {
      return undefined;
    }

    if (audioElPath.current && audioElPath.current !== currentPath) {
      flushFromElementRef.current?.(audio);
    }

    if (!currentPath) {
      audio.removeAttribute('src');
      audio.load();
      audioElPath.current = null;
      return undefined;
    }

    audioElPath.current = currentPath;
    didSeek.current = false;
    audio.src = mediaUrl(currentPath);
    audio.load();

    const clearSeekListeners = () => {
      if (seekListener.current) {
        audio.removeEventListener('loadedmetadata', seekListener.current);
        audio.removeEventListener('canplay', seekListener.current);
        seekListener.current = null;
      }
    };

    const pendingSeek = seekToSecondsRef.current > 0;
    if (pendingSeek) {
      trySeekRef.current?.(audio);
      return clearSeekListeners;
    }

    const timer = window.setTimeout(() => {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    }, AUTOPLAY_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      clearSeekListeners();
    };
  }, [currentPath]);

  useEffect(() => {
    const audio = audioEl.current;
    if (
      !audio ||
      !currentPath ||
      audioElPath.current !== currentPath ||
      seekToSeconds <= 0 ||
      didSeek.current
    ) {
      return;
    }
    trySeekRef.current?.(audio);
  }, [seekToSeconds, currentPath]);

  useEffect(() => {
    const audio = audioEl.current;
    return () => {
      if (audio && audioElPath.current) {
        flushFromElementRef.current?.(audio);
      }
    };
  }, [currentPath]);

  const togglePlayPause = useCallback(() => {
    const audio = audioEl.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, []);

  const handleProgressClick = useCallback((event) => {
    const audio = audioEl.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const nextTime = Math.max(0, Math.min(audio.duration, ratio * audio.duration));
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, []);

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
  const progressPct =
    duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const isPaused = !isPlaying;

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
          <a href={mediaUrl(currentPath)} aria-label="Download track">
            <i className="download fas fa-download" />
          </a>
        </div>
      </div>
      <div className="bottom-playback-bar__player">
        <div className="audio_player">
          <div
            className="skip_button back audio_button"
            role="button"
            aria-label="Previous track"
            tabIndex={0}
            onClick={() => onPrevious && onPrevious()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (onPrevious) {
                  onPrevious();
                }
              }
            }}
          >
            <div className="skip_button_inner">
              <div className="right_facing_triangle" />
            </div>
          </div>
          <div
            className={
              'play_pause_button audio_button' + (isPaused ? ' paused' : '')
            }
            role="button"
            aria-label={isPaused ? 'Play' : 'Pause'}
            tabIndex={0}
            onClick={togglePlayPause}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                togglePlayPause();
              }
            }}
          >
            <div className="play_pause_inner">
              <div className="left" />
              <div className="triangle_1" />
              <div className="triangle_2" />
              <div className="right" />
            </div>
          </div>
          <div
            className="skip_button audio_button"
            role="button"
            aria-label="Next track"
            tabIndex={0}
            onClick={() => onNext && onNext()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (onNext) {
                  onNext();
                }
              }
            }}
          >
            <div className="skip_button_inner">
              <div className="right_facing_triangle" />
            </div>
          </div>
          <div className="spacer" />
          <div
            className="audio_progress_container"
            role="slider"
            aria-label="Seek"
            tabIndex={0}
            onClick={handleProgressClick}
          >
            <div className="audio_progress" style={{ width: `${progressPct}%` }} />
            <div className="audio_progress_overlay">
              <div className="audio_info_marquee">
                <p className="audio_info">{songTitle}</p>
              </div>
              <div className="audio_time_progress">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>
          </div>
          <audio
            ref={audioEl}
            preload="metadata"
            onPlay={handlePlay}
            onPause={handlePause}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
          />
        </div>
      </div>
    </div>
  );
}
