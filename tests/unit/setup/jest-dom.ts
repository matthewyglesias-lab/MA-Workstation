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

// jsdom does not implement the <dialog> element's imperative methods (only
// the `open` IDL attribute, via generic reflection) - showModal()/close()
// are simply absent from the prototype. Every ModalDialog-based screen in
// this app calls dialog.showModal() unconditionally on mount, which throws
// "dialog.showModal is not a function" under jsdom without this polyfill.
// Tracked upstream: https://github.com/jsdom/jsdom/issues/3294
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
}
if (typeof HTMLDialogElement.prototype.close !== 'function') {
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}

// Node's native fetch leaks into the jsdom test environment as a real,
// working global. InjectionPanel/UdsPanel build an NDC option resolver
// (src/domain/injection-ndc.ts's createNdcOptionResolver) with no injected
// fetcher, so rendering either panel with any medication+dose already set
// fires a real, unawaited request against the live FDA NDC directory on
// mount. Reject unconditionally so every component test exercises the same
// graceful offline fallback the resolver already has to handle in
// production, instead of an unmocked HTTP call racing the test run. A test
// that needs to control the response can still override this per-test with
// vi.stubGlobal('fetch', ...) / vi.spyOn(globalThis, 'fetch').
globalThis.fetch = () => Promise.reject(new Error('network access is disabled in unit tests'));
