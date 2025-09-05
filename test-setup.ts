import '@testing-library/jest-dom';
import { fakeBrowser } from '@webext-core/fake-browser';

// Set up WXT's fake browser for testing with enhanced Chrome API support
const enhancedFakeBrowser = {
  ...fakeBrowser,
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    clearAll: vi.fn(),
    get: vi.fn(),
    getAll: vi.fn(),
    onAlarm: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn().mockReturnValue(false),
    }
  }
};

Object.defineProperty(globalThis, 'browser', {
  value: enhancedFakeBrowser,
  writable: true,
});

// Chrome API compatibility (some extensions use chrome instead of browser)
Object.defineProperty(globalThis, 'chrome', {
  value: enhancedFakeBrowser,
  writable: true,
});

// Mock fetch for GitHub API tests
globalThis.fetch = vi.fn();

// Mock window.open for bookmark links
Object.defineProperty(window, 'open', {
  value: vi.fn(),
  writable: true,
});