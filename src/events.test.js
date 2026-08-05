import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __setSharedEventLoggerForTests,
  createEventLogger,
  createSearchTracker,
} from './events';

describe('createEventLogger', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PROMO_EVENTS_KEY', 'test-key');
    vi.stubEnv('VITE_PROMO_EVENTS_URL', '/events');
    __setSharedEventLoggerForTests(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('no-ops when key is missing', () => {
    vi.stubEnv('VITE_PROMO_EVENTS_KEY', '');
    const fetchImpl = vi.fn();
    const logger = createEventLogger({ fetchImpl, sessionId: '11111111-1111-4111-8111-111111111111' });
    logger.track('page_view');
    expect(logger.isEnabled()).toBe(false);
    expect(logger.getQueue()).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('batches events and flushes with key header', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    const logger = createEventLogger({
      fetchImpl,
      sessionId: '11111111-1111-4111-8111-111111111111',
      now: () => '2026-08-05T12:00:00.000Z',
      flushMs: 1000,
      enabled: true,
    });

    logger.track('page_view', {}, '/k');
    logger.track('play_started', { song_path: 'mixtape/a.mp3' }, '/k');
    expect(logger.getQueue()).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/events');
    expect(init.method).toBe('POST');
    expect(init.headers['x-promo-key']).toBe('test-key');
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body)).toEqual({
      events: [
        {
          ts: '2026-08-05T12:00:00.000Z',
          event: 'page_view',
          session_id: '11111111-1111-4111-8111-111111111111',
          path: '/k',
          props: {},
        },
        {
          ts: '2026-08-05T12:00:00.000Z',
          event: 'play_started',
          session_id: '11111111-1111-4111-8111-111111111111',
          path: '/k',
          props: { song_path: 'mixtape/a.mp3' },
        },
      ],
    });
    expect(logger.getQueue()).toEqual([]);
  });

  it('ignores unknown event names', () => {
    const logger = createEventLogger({
      fetchImpl: vi.fn(),
      sessionId: '11111111-1111-4111-8111-111111111111',
      enabled: true,
    });
    logger.track('not_real');
    expect(logger.getQueue()).toEqual([]);
  });
});

describe('createSearchTracker', () => {
  it('debounces search events', async () => {
    vi.useFakeTimers();
    const track = vi.fn();
    const onSearch = createSearchTracker(track, { delayMs: 300 });
    onSearch('a', '/k');
    onSearch('ab', '/k');
    onSearch('abc', '/k');
    expect(track).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('search', { query: 'abc' }, '/k');
  });
});
