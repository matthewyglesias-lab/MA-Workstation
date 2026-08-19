import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/preact';
import { afterEach } from 'vitest';

// @testing-library/preact only self-registers this afterEach when `afterEach`
// exists as a bare global, which requires Vitest's `test.globals` option.
// This project imports test APIs explicitly instead of enabling globals, so
// unmounting between tests has to be wired up here rather than left to the
// library's own (silently no-op) auto-cleanup.
afterEach(() => {
  cleanup();
});
