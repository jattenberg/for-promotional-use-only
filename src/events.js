const FLUSH_MS = 5000;
const MAX_BATCH = 50;
const MAX_BODY_BYTES = 32 * 1024;
const SEARCH_DEBOUNCE_MS = 600;
const SESSION_KEY = 'promo.events.session_id';

const ALLOWED_EVENTS = new Set([
  'page_view',
  'play_started',
  'play_completed',
  'search',
  'favorite_add',
  'favorite_remove',
]);

const eventsUrl = () => import.meta.env.VITE_PROMO_EVENTS_URL || '/events';
const eventsKey = () => import.meta.env.VITE_PROMO_EVENTS_KEY || '';

const newSessionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
};

const readSessionId = () => {
  if (typeof sessionStorage === 'undefined') {
    return newSessionId();
  }
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) {
    return existing;
  }
  const created = newSessionId();
  sessionStorage.setItem(SESSION_KEY, created);
  return created;
};

const isoNow = () => new Date().toISOString();

const encodeBatch = (events) => JSON.stringify({ events });

/**
 * Create a batched product-event client.
 *
 * Args:
 *   options.fetchImpl (function, optional): Override fetch (tests).
 *   options.now (function, optional): Clock override.
 *   options.sessionId (string, optional): Fixed session id.
 *   options.enabled (boolean, optional): Force enable/disable.
 *   options.flushMs (number, optional): Flush interval.
 */
export function createEventLogger(options = {}) {
  const fetchImpl = options.fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  const now = options.now || isoNow;
  const sessionId = options.sessionId || readSessionId();
  const flushMs = options.flushMs ?? FLUSH_MS;
  const enabled =
    options.enabled ?? Boolean(eventsKey() && fetchImpl);

  let queue = [];
  let timer = null;
  let flushing = false;

  const clearTimer = () => {
    if (timer != null && typeof clearTimeout === 'function') {
      clearTimeout(timer);
    }
    timer = null;
  };

  const scheduleFlush = () => {
    if (!enabled || timer != null || typeof setTimeout !== 'function') {
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, flushMs);
  };

  const track = (eventName, props = {}, path = typeof location !== 'undefined' ? location.pathname : '/') => {
    if (!enabled || !ALLOWED_EVENTS.has(eventName)) {
      return;
    }
    const envelope = {
      ts: now(),
      event: eventName,
      session_id: sessionId,
      path: path || '/',
      props: props && typeof props === 'object' ? props : {},
    };
    queue = [...queue, envelope].slice(-MAX_BATCH * 2);
    scheduleFlush();
  };

  const flush = async () => {
    if (!enabled || flushing || queue.length === 0 || !fetchImpl) {
      return;
    }
    clearTimer();
    const takeFittingBatch = (candidates) => {
      if (!candidates.length) {
        return [];
      }
      const body = encodeBatch(candidates);
      if (body.length <= MAX_BODY_BYTES || candidates.length === 1) {
        return body.length <= MAX_BODY_BYTES ? candidates : [];
      }
      return takeFittingBatch(candidates.slice(0, -1));
    };
    const batch = takeFittingBatch(queue.slice(0, MAX_BATCH));
    if (!batch.length) {
      queue = queue.slice(1);
      return;
    }
    const body = encodeBatch(batch);
    queue = queue.slice(batch.length);
    flushing = true;
    try {
      await fetchImpl(eventsUrl(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-promo-key': eventsKey(),
        },
        body,
        keepalive: true,
      });
    } catch {
      queue = [...batch, ...queue].slice(0, MAX_BATCH * 2);
    } finally {
      flushing = false;
      if (queue.length) {
        scheduleFlush();
      }
    }
  };

  const installPageLifecycle = () => {
    if (!enabled || typeof document === 'undefined') {
      return () => {};
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      clearTimer();
    };
  };

  return {
    track,
    flush,
    installPageLifecycle,
    getQueue: () => queue,
    isEnabled: () => enabled,
  };
}

let sharedLogger = null;

export function getEventLogger() {
  if (!sharedLogger) {
    sharedLogger = createEventLogger();
    sharedLogger.installPageLifecycle();
  }
  return sharedLogger;
}

/** Test helper: replace the shared singleton. */
export function __setSharedEventLoggerForTests(logger) {
  sharedLogger = logger;
}

/**
 * Debounced search tracker.
 *
 * Args:
 *   track (function): Logger track fn.
 *   options.delayMs (number, optional): Debounce delay.
 */
export function createSearchTracker(track, options = {}) {
  const delayMs = options.delayMs ?? SEARCH_DEBOUNCE_MS;
  let handle = null;
  return (query, path) => {
    if (typeof clearTimeout === 'function' && handle != null) {
      clearTimeout(handle);
    }
    const trimmed = String(query || '').trim();
    if (!trimmed) {
      return;
    }
    if (typeof setTimeout !== 'function') {
      track('search', { query: trimmed }, path);
      return;
    }
    handle = setTimeout(() => {
      track('search', { query: trimmed }, path);
      handle = null;
    }, delayMs);
  };
}
