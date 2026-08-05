import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  HTMLMediaElement.prototype.pause = vi.fn();
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});
