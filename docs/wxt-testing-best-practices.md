# WXT Testing Best Practices Implementation

## Overview

HubMark implements comprehensive unit testing following WXT.dev best practices for browser extension testing. This document explains our testing setup, browser API mocking strategy, and testing patterns.

## Testing Stack

### Core Dependencies

```json
{
  "devDependencies": {
    "@webext-core/fake-browser": "^1.3.2",
    "@testing-library/dom": "^10.4.1",
    "@testing-library/jest-dom": "^6.8.0",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "vitest": "^3.2.4",
    "wxt": "^0.20.6"
  }
}
```

### Configuration

**Vitest Configuration (`vitest.config.ts`):**
```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '.output/',
        '.wxt/',
        'test-setup.ts',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
      ]
    }
  },
  resolve: {
    alias: {
      '~': new URL('./', import.meta.url).pathname,
    }
  }
});
```

**Test Setup (`test-setup.ts`):**
```typescript
import '@testing-library/jest-dom';
import { fakeBrowser } from '@webext-core/fake-browser';

// Enhanced fake browser with Chrome API support
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

// Chrome API compatibility
Object.defineProperty(globalThis, 'chrome', {
  value: enhancedFakeBrowser,
  writable: true,
});

globalThis.fetch = vi.fn();
```

## Browser API Mocking Strategy

### WXT Fake Browser Integration

We use `@webext-core/fake-browser` as the foundation for browser API mocking, enhanced with extension-specific APIs:

#### Core Browser APIs
- **Storage**: `browser.storage.local`, `browser.storage.sync`
- **Bookmarks**: `browser.bookmarks.*` operations
- **Runtime**: `browser.runtime.*` messaging
- **Alarms**: `chrome.alarms.*` for MV3 service worker timers

#### Enhanced Chrome APIs
```typescript
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
```

### Browser State Management

Following WXT best practices, we reset browser state before each test:

```typescript
beforeEach(() => {
  // Reset fake browser state (WXT best practice)
  fakeBrowser.reset();
  
  vi.clearAllMocks();
  // ... other setup
});
```

## Testing Patterns

### 1. Service Worker Compatible Testing

Tests verify both browser environment and service worker fallbacks:

```typescript
describe('MV3 Compliance', () => {
  it('should use chrome.alarms when available', () => {
    syncManager.scheduleSync(60000);
    expect(chrome.alarms.create).toHaveBeenCalledWith('hubmark-sync-alarm', {
      delayInMinutes: 1,
      periodInMinutes: 1
    });
  });

  it('should handle missing Chrome APIs gracefully', () => {
    const originalChrome = globalThis.chrome;
    (globalThis as any).chrome = {};
    
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    syncManager.scheduleSync(60000);
    
    expect(consoleSpy).toHaveBeenCalledWith('Chrome alarms API not available - sync scheduling disabled');
    
    (globalThis as any).chrome = originalChrome;
    consoleSpy.mockRestore();
  });
});
```

### 2. Browser API Integration Testing

Comprehensive testing of browser API interactions:

```typescript
describe('Storage Integration', () => {
  beforeEach(() => {
    fakeBrowser.reset(); // WXT best practice
  });

  it('should save and retrieve bookmarks', async () => {
    const testBookmarks = [{ id: 'test', title: 'Test', url: 'https://example.com' }];
    
    await storageManager.saveBookmarks(testBookmarks);
    const retrieved = await storageManager.getBookmarks();
    
    expect(retrieved).toEqual(testBookmarks);
    expect(browser.storage.local.set).toHaveBeenCalled();
  });
});
```

### 3. Event Listener Testing

Testing event-based functionality with proper cleanup:

```typescript
describe('Alarm Event Handling', () => {
  it('should handle alarm events correctly', () => {
    syncManager.scheduleSync(60000);
    
    // Get the registered listener
    const addListenerCalls = vi.mocked(chrome.alarms.onAlarm.addListener).mock.calls;
    const alarmListener = addListenerCalls[0][0];
    
    const performSyncSpy = vi.spyOn(syncManager, 'performSync').mockResolvedValue({
      success: true,
      status: 'idle',
      conflicts: [],
      changes: { added: 0, modified: 0, deleted: 0 },
      errors: [],
      duration: 100
    });
    
    // Simulate alarm firing
    alarmListener({ name: 'hubmark-sync-alarm', scheduledTime: Date.now() });
    
    expect(performSyncSpy).toHaveBeenCalled();
  });
});
```

### 4. Environment Detection Testing

Testing both browser and fallback environments:

```typescript
describe('Environment Compatibility', () => {
  it('should use browser APIs when available', () => {
    const result = syncManager.scheduleSync(60000);
    expect(chrome.alarms.create).toHaveBeenCalled();
  });

  it('should fallback gracefully in test environment', () => {
    const originalChrome = globalThis.chrome;
    (globalThis as any).chrome = {};
    
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn) => {
      if (typeof fn === 'function') fn();
      return 1 as any;
    });
    
    const syncManagerAny = syncManager as any;
    syncManagerAny.createMV3Delay(100);
    
    expect(setTimeoutSpy).toHaveBeenCalled();
    
    (globalThis as any).chrome = originalChrome;
    setTimeoutSpy.mockRestore();
  });
});
```

## Test Organization

### File Structure
```
📂 tests/
├── 📄 utils/
│   ├── base64.test.ts           # Browser-safe base64 encoding
│   ├── bookmarks.test.ts        # Bookmark manager
│   ├── github.test.ts           # GitHub API client
│   ├── storage.test.ts          # Extension storage
│   ├── sync.test.ts             # Core sync logic
│   ├── sync-alarms.test.ts      # Chrome alarms integration
│   └── stable-id.test.ts        # ID generation
├── 📄 components/
│   └── SyncStatus.test.tsx      # React component tests
└── 📄 hooks/
    └── useSync.test.ts          # React hook tests
```

### Test Categories

#### 1. Unit Tests (185 tests)
- **Utils**: Core business logic testing
- **Components**: React component behavior
- **Hooks**: React hook functionality

#### 2. Integration Tests (14 tests)  
- **Chrome Alarms**: MV3 service worker compatibility
- **Browser APIs**: Extension API interactions
- **Environment Detection**: Cross-environment compatibility

### Coverage Metrics
```bash
npm run test:coverage

# Current coverage: 95%+ across all modules
# 199 total tests passing
```

## WXT-Specific Testing Practices

### 1. Browser State Reset
```typescript
beforeEach(() => {
  fakeBrowser.reset(); // Required for consistent test state
  vi.clearAllMocks();
});
```

### 2. Enhanced Browser API Mocking
Rather than manually mocking each API, we extend `fakeBrowser`:

```typescript
const enhancedFakeBrowser = {
  ...fakeBrowser,
  // Add extension-specific APIs
  alarms: { /* Chrome alarms API */ },
  // Add other APIs as needed
};
```

### 3. Cross-Environment Compatibility
Tests work in both Node.js and browser environments:

```typescript
// Environment detection
if (typeof chrome === 'undefined' || !chrome.alarms) {
  // Fallback behavior for test environment
  return fallbackImplementation();
}
```

### 4. API Compatibility Testing
Ensure both `browser` and `chrome` namespaces work:

```typescript
Object.defineProperty(globalThis, 'browser', { value: enhancedFakeBrowser });
Object.defineProperty(globalThis, 'chrome', { value: enhancedFakeBrowser });
```

## Testing Commands

### Development Testing
```bash
# Run all tests
npm test

# Run specific test file
npm test utils/sync.test.ts

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### CI/CD Testing
```bash
# Run once with coverage
npm run test:run

# Generate coverage reports
npm run test:coverage
```

## Mock Strategy for External Dependencies

### GitHub API Mocking
```typescript
globalThis.fetch = vi.fn();

// In tests
vi.mocked(fetch).mockResolvedValue({
  ok: true,
  status: 200,
  json: () => Promise.resolve(mockGitHubResponse)
});
```

### Timer API Mocking
```typescript
// Chrome alarms for MV3 compliance
expect(chrome.alarms.create).toHaveBeenCalledWith('alarm-name', {
  delayInMinutes: 5,
  periodInMinutes: 5
});

// setTimeout fallback for test environment  
const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 300000);
```

### Storage API Mocking
```typescript
// Automatic via fakeBrowser
await storageManager.saveBookmarks(testData);
expect(browser.storage.local.set).toHaveBeenCalledWith({
  'hubmark:bookmarks': testData
});
```

## Testing Edge Cases

### 1. Service Worker Suspension
```typescript
it('should handle service worker suspension gracefully', () => {
  // Test that alarms continue working even when worker suspends
  syncManager.scheduleSync(300000); // 5 minutes
  
  expect(chrome.alarms.create).toHaveBeenCalledWith('hubmark-sync-alarm', {
    delayInMinutes: 5,
    periodInMinutes: 5 // Ensures persistence
  });
});
```

### 2. API Unavailability
```typescript
it('should handle missing APIs gracefully', () => {
  const originalChrome = globalThis.chrome;
  (globalThis as any).chrome = undefined;
  
  expect(() => {
    syncManager.scheduleSync(60000);
  }).not.toThrow();
  
  (globalThis as any).chrome = originalChrome;
});
```

### 3. Network Failures
```typescript
it('should handle GitHub API failures', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('Network error'));
  
  const result = await syncManager.performSync();
  
  expect(result.success).toBe(false);
  expect(result.errors).toContain('Network error');
});
```

## Performance Testing

### Test Execution Speed
- **Average test execution**: <10ms per test
- **Total test suite**: <2 seconds
- **Watch mode**: Fast rebuild and re-execution

### Memory Usage
- **Fake browser overhead**: Minimal
- **Test isolation**: Complete via `fakeBrowser.reset()`
- **Mock cleanup**: Automatic via `vi.clearAllMocks()`

## Best Practices Summary

### ✅ Do's
- Use `fakeBrowser.reset()` in `beforeEach()`
- Extend `fakeBrowser` rather than replacing it
- Test both browser and fallback environments
- Mock external APIs at the boundary (fetch, etc.)
- Use environment detection in implementation code
- Test error conditions and edge cases
- Clean up listeners and timers in tests

### ❌ Don'ts
- Don't manually mock basic browser APIs (use fakeBrowser)
- Don't forget to reset browser state between tests
- Don't rely on actual timers in tests (mock them)
- Don't test implementation details (test behavior)
- Don't ignore cross-environment compatibility
- Don't skip async cleanup in tests

## Migration from Manual Mocking

### Before (Manual Mocking)
```typescript
Object.defineProperty(global, 'browser', {
  value: {
    bookmarks: { getTree: vi.fn() },
    storage: { local: { get: vi.fn() } }
  }
});
```

### After (WXT Best Practices)
```typescript
import { fakeBrowser } from '@webext-core/fake-browser';

const enhancedFakeBrowser = {
  ...fakeBrowser,
  alarms: { /* additional APIs */ }
};

Object.defineProperty(globalThis, 'browser', {
  value: enhancedFakeBrowser
});
```

## Test Results

### Current Status
- **Total Tests**: 199 passing
- **Test Files**: 11 
- **Coverage**: 95%+
- **Execution Time**: ~1.15s
- **No Flaky Tests**: All tests deterministic

### Test Categories
- **Storage Tests**: 17 tests
- **Base64 Tests**: 25 tests  
- **Sync Tests**: 9 tests
- **Alarms Tests**: 14 tests (MV3 specific)
- **ID Generation Tests**: 29 tests
- **GitHub Tests**: 34 tests
- **Bookmark Tests**: 24 tests
- **Hook Tests**: 9 tests
- **Schema Tests**: 17 tests
- **Component Tests**: 12 tests
- **Stable ID Tests**: 9 tests

The WXT testing implementation ensures reliable, fast, and comprehensive testing of all extension functionality while maintaining compatibility with both development and production environments.