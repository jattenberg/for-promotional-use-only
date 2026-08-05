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

  it('re-queues the batch when the server returns a 5xx', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const logger = createEventLogger({
      fetchImpl,
      sessionId: '11111111-1111-4111-8111-111111111111',
      flushMs: 1000,
      enabled: true,
    });

    logger.track('page_view', {}, '/k');
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(logger.getQueue()).toHaveLength(1);
  });

  it('discards the batch when the server returns a 4xx', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const logger = createEventLogger({
      fetchImpl,
      sessionId: '11111111-1111-4111-8111-111111111111',
      flushMs: 1000,
      enabled: true,
    });

    logger.track('page_view', {}, '/k');
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(logger.getQueue()).toEqual([]);
  });

  it('re-queues the batch when the request throws', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    const logger = createEventLogger({
      fetchImpl,
      sessionId: '11111111-1111-4111-8111-111111111111',
      flushMs: 1000,
      enabled: true,
    });

    logger.track('page_view', {}, '/k');
    await vi.advanceTimersByTimeAsync(1000);

    expect(logger.getQueue()).toHaveLength(1);
  });

  it('drops an unsendable oversized event and still flushes the rest', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    const logger = createEventLogger({
      fetchImpl,
      sessionId: '11111111-1111-4111-8111-111111111111',
      flushMs: 1000,
      enabled: true,
    });

    logger.track('search', { query: 'x'.repeat(40000) }, '/k');
    logger.track('page_view', {}, '/k');

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).events).toHaveLength(1);
    expect(logger.getQueue()).toEqual([]);
    warn.mockRestore();
  });

  it('backs off exponentially across consecutive failures', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const logger = createEventLogger({
      fetchImpl,
      sessionId: '11111111-1111-4111-8111-111111111111',
      flushMs: 1000,
      random: () => 1,
      enabled: true,
    });

    logger.track('page_view', {}, '/k');

    // First attempt on the normal cadence, then ceilings of 2x, 4x, 8x.
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(3999);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(8000);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(logger.getFailureCount()).toBe(4);
    expect(logger.getQueue()).toHaveLength(1);
  });

  it('never retries sooner than the normal flush interval', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const logger = createEventLogger({
      fetchImpl,
      sessionId: '11111111-1111-4111-8111-111111111111',
      flushMs: 1000,
      random: () => 0,
      enabled: true,
    });

    logger.track('page_view', {}, '/k');
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('caps the backoff delay', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const logger = createEventLogger({
      fetchImpl,
      sessionId: '11111111-1111-4111-8111-111111111111',
      flushMs: 60000,
      random: () => 1,
      enabled: true,
    });

    logger.track('page_view', {}, '/k');
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // 60s * 2^1 exceeds the 5 minute cap, so the wait is the cap itself.
    await vi.advanceTimersByTimeAsync(300000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('resets the backoff after a successful flush', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({ ok: true, status: 204 });
    const logger = createEventLogger({
      fetchImpl,
      sessionId: '11111111-1111-4111-8111-111111111111',
      flushMs: 1000,
      random: () => 1,
      enabled: true,
    });

    logger.track('page_view', {}, '/k');
    await vi.advanceTimersByTimeAsync(1000);
    expect(logger.getFailureCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(logger.getFailureCount()).toBe(0);
    expect(logger.getQueue()).toEqual([]);

    // Back on the normal cadence for the next event.
    logger.track('page_view', {}, '/k');
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('resets the backoff after a permanent 4xx', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({ ok: false, status: 400 });
    const logger = createEventLogger({
      fetchImpl,
      sessionId: '11111111-1111-4111-8111-111111111111',
      flushMs: 1000,
      random: () => 1,
      enabled: true,
    });

    logger.track('page_view', {}, '/k');
    await vi.advanceTimersByTimeAsync(1000);
    expect(logger.getFailureCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(logger.getFailureCount()).toBe(0);
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
