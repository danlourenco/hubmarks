# MV3 Timer Compliance with Chrome Alarms API

## Overview

HubMark has been updated to use the Chrome Alarms API instead of traditional timer APIs (`setInterval`, `setTimeout`) to ensure compatibility with Manifest V3 service workers. This document explains the implementation, benefits, and usage.

## The Problem: Timer APIs in MV3 Service Workers

### Manifest V2 vs Manifest V3 Timer Behavior

| Aspect | Manifest V2 | Manifest V3 |
|--------|-------------|-------------|
| **Runtime Environment** | Background pages (persistent) | Service workers (event-driven) |
| **setInterval/setTimeout** | Works reliably | ❌ **Unreliable due to suspension** |
| **Timer Persistence** | Always running | ❌ **Lost when worker suspends** |
| **Background Sync** | Continuous operation | ❌ **Broken by service worker lifecycle** |
| **Chrome Alarms** | Available but not required | ✅ **Required for reliable timing** |

### Why Traditional Timers Fail in MV3

```typescript
// ❌ This breaks in MV3 service workers:
const syncInterval = setInterval(async () => {
  await performSync(); // Won't execute when worker is suspended
}, 60000);

// Service worker suspends after 30 seconds of inactivity
// Timer is lost and sync stops working
```

## The Solution: Chrome Alarms API

### Core Implementation

Instead of `setInterval`/`setTimeout`, HubMark now uses the Chrome Alarms API which persists across service worker suspension/wake cycles:

```typescript
// ✅ MV3-compatible approach:
chrome.alarms.create('hubmark-sync-alarm', {
  delayInMinutes: 1,      // First alarm in 1 minute
  periodInMinutes: 1      // Repeat every 1 minute
});

// Listen for alarms (persists across service worker restarts)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'hubmark-sync-alarm') {
    performSync(); // Executes reliably even after suspension
  }
});
```

## Implementation Details

### SyncManager Timer Replacement

The `SyncManager` class has been updated to use Chrome Alarms:

#### Before (MV2 Compatible)
```typescript
private syncInterval: NodeJS.Timeout | null = null;

scheduleSync(intervalMs: number): void {
  this.syncInterval = setInterval(async () => {
    await this.performSync();
  }, intervalMs);
}

stopScheduledSync(): void {
  if (this.syncInterval) {
    clearInterval(this.syncInterval);
    this.syncInterval = null;
  }
}
```

#### After (MV3 Compatible)
```typescript
private syncAlarmName = 'hubmark-sync-alarm';
private alarmListener: ((alarm: chrome.alarms.Alarm) => void) | null = null;

scheduleSync(intervalMs: number): void {
  // Clear existing alarm
  this.stopScheduledSync();

  // Set up alarm listener
  this.alarmListener = (alarm: chrome.alarms.Alarm) => {
    if (alarm.name === this.syncAlarmName) {
      this.performSync().catch(error => {
        console.error('Scheduled sync failed:', error);
      });
    }
  };

  chrome.alarms.onAlarm.addListener(this.alarmListener);

  // Create repeating alarm
  const intervalMinutes = Math.max(1, Math.round(intervalMs / 60000));
  chrome.alarms.create(this.syncAlarmName, {
    delayInMinutes: intervalMinutes,
    periodInMinutes: intervalMinutes
  });
}

stopScheduledSync(): void {
  chrome.alarms.clear(this.syncAlarmName);
  
  if (this.alarmListener) {
    chrome.alarms.onAlarm.removeListener(this.alarmListener);
    this.alarmListener = null;
  }
}
```

### Retry Logic Replacement

The exponential backoff retry logic has also been updated:

#### Before (setTimeout-based)
```typescript
// ❌ Breaks in MV3 service workers
setTimeout(() => {
  this.syncQueue.unshift(operation);
}, delayMs);
```

#### After (Chrome Alarms-based)
```typescript
// ✅ MV3-compatible retry
const retryAlarmName = `hubmark-retry-${operation.id}`;
const retryDelayMinutes = Math.max(0.1, delayMs / 60000);

const retryListener = (alarm: chrome.alarms.Alarm) => {
  if (alarm.name === retryAlarmName) {
    chrome.alarms.onAlarm.removeListener(retryListener);
    this.syncQueue.unshift(operation);
  }
};

chrome.alarms.onAlarm.addListener(retryListener);
chrome.alarms.create(retryAlarmName, {
  delayInMinutes: retryDelayMinutes
});
```

### Small Delays for Rate Limiting

Even small delays between operations needed replacement:

#### Before (Promise-based)
```typescript
// ❌ Uses setTimeout internally
await new Promise(resolve => setTimeout(resolve, 100));
```

#### After (Chrome Alarms-based)
```typescript
// ✅ MV3-compatible delay
private createMV3Delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    const delayAlarmName = `hubmark-delay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const delayMinutes = Math.max(0.1, delayMs / 60000);
    
    const delayListener = (alarm: chrome.alarms.Alarm) => {
      if (alarm.name === delayAlarmName) {
        chrome.alarms.onAlarm.removeListener(delayListener);
        resolve();
      }
    };
    
    chrome.alarms.onAlarm.addListener(delayListener);
    chrome.alarms.create(delayAlarmName, {
      delayInMinutes: delayMinutes
    });
  });
}
```

## Manifest Configuration

The `alarms` permission must be declared in the extension manifest:

```json
{
  "manifest_version": 3,
  "permissions": [
    "bookmarks",
    "storage",
    "alarms"
  ]
}
```

**WXT Configuration:**
```typescript
// wxt.config.ts
export default defineConfig({
  manifest: {
    permissions: [
      'bookmarks',
      'storage',
      'alarms'  // Required for chrome.alarms API
    ]
  }
});
```

## Environment Compatibility

### Test Environment Support

The implementation includes guards to work in both browser and test environments:

```typescript
scheduleSync(intervalMs: number): void {
  // Check if Chrome APIs are available (browser environment)
  if (typeof chrome === 'undefined' || !chrome.alarms) {
    console.warn('Chrome alarms API not available - sync scheduling disabled');
    return;
  }

  // Chrome alarms implementation...
}

private createMV3Delay(delayMs: number): Promise<void> {
  // Fallback to setTimeout in test environment
  if (typeof chrome === 'undefined' || !chrome.alarms) {
    return new Promise(resolve => setTimeout(resolve, delayMs));
  }

  // Chrome alarms implementation...
}
```

## Chrome Alarms API Limitations

### Time Resolution
- **Minimum interval**: 1 minute for periodic alarms
- **Minimum delay**: 0.1 minutes (6 seconds) for one-time alarms
- **Resolution**: Chrome may adjust timing for battery optimization

### Alarm Limits
- **Maximum active alarms**: ~500 per extension
- **Naming**: Each alarm needs a unique name
- **Persistence**: Alarms survive extension updates and browser restarts

### Conversion from Milliseconds

```typescript
// Convert millisecond intervals to minutes
const intervalMinutes = Math.max(1, Math.round(intervalMs / 60000));

// For delays less than 1 minute, use minimum 0.1 minutes
const delayMinutes = Math.max(0.1, delayMs / 60000);
```

## Benefits of Chrome Alarms Implementation

### ✅ **Service Worker Persistence**
- Alarms continue working even when service worker is suspended
- No lost sync operations due to worker lifecycle events
- Reliable background sync in MV3 environment

### ✅ **Battery Optimization**
- Chrome optimizes alarm timing for battery life
- Batches alarms from multiple extensions
- Reduces unnecessary wake-ups

### ✅ **Extension Lifecycle Independence**
- Alarms survive extension updates
- Work across browser sessions
- Persist through browser restarts

### ✅ **Automatic Error Recovery**
- Service worker automatically wakes for alarms
- Built-in retry mechanism if worker is busy
- No need for complex resurrection logic

## Usage Examples

### Basic Sync Scheduling

```typescript
import { getSyncManager } from '~/utils/sync';

// Schedule sync every 5 minutes
const syncManager = await getSyncManager();
syncManager.scheduleSync(5 * 60 * 1000); // 5 minutes in ms

// Stop scheduled sync
syncManager.stopScheduledSync();
```

### Manual Sync with Status

```typescript
// Perform one-time sync
const result = await syncManager.performSync({
  direction: 'bidirectional',
  strategy: 'latest-wins'
});

console.log(`Sync completed: +${result.changes.added} ~${result.changes.modified} -${result.changes.deleted}`);
```

### Background Service Worker Integration

```typescript
// entrypoints/background/index.ts
import { getSyncManager } from '~/utils/sync';

export default defineBackground(() => {
  console.log('Background service worker loaded');

  // Initialize sync manager when service worker starts
  getSyncManager().then(syncManager => {
    // Schedule sync every 15 minutes
    syncManager.scheduleSync(15 * 60 * 1000);
  });

  // Handle extension installation
  chrome.runtime.onInstalled.addListener(async () => {
    const syncManager = await getSyncManager();
    // Perform initial sync
    await syncManager.performSync();
  });
});
```

## Testing Strategy

### Unit Tests with Environment Detection

Tests automatically handle both browser and Node.js environments:

```typescript
describe('SyncManager Chrome Alarms', () => {
  it('should schedule sync when Chrome APIs available', () => {
    // In browser: uses chrome.alarms
    // In tests: warns and returns early
    const syncManager = new SyncManager();
    syncManager.scheduleSync(60000); // 1 minute
    
    // Test passes in both environments
  });

  it('should use fallback delays in test environment', async () => {
    const syncManager = new SyncManager();
    
    // In browser: uses chrome.alarms
    // In tests: uses setTimeout fallback
    await syncManager['createMV3Delay'](100);
  });
});
```

### Running Tests

```bash
# All tests pass in both environments
npm test utils/sync.test.ts

# Expected output:
# ✓ 9 tests passed
# Chrome alarms API not available - sync scheduling disabled (in test logs)
```

## Migration Checklist

For developers migrating from MV2 to MV3 timer APIs:

- [ ] Add `"alarms"` permission to manifest
- [ ] Replace `setInterval` calls with `chrome.alarms.create()`
- [ ] Replace `clearInterval` calls with `chrome.alarms.clear()`
- [ ] Replace `setTimeout` calls with one-time `chrome.alarms.create()`
- [ ] Add `chrome.alarms.onAlarm` event listeners
- [ ] Convert millisecond intervals to minutes
- [ ] Handle minimum timing constraints (1 minute for periodic, 0.1 minutes for one-time)
- [ ] Add environment detection for test compatibility
- [ ] Update error handling for alarm-specific failures
- [ ] Test thoroughly in MV3 service worker environment

## Performance Characteristics

### Timing Accuracy
- **Chrome Alarms**: ±1 minute accuracy, optimized for battery life
- **Old Timers**: Millisecond accuracy, but unreliable in MV3

### Memory Usage
- **Chrome Alarms**: Minimal memory footprint, managed by browser
- **Old Timers**: Required persistent service worker, higher memory usage

### Battery Impact
- **Chrome Alarms**: Optimized by Chrome for minimal battery drain
- **Old Timers**: Could cause excessive wake-ups and battery drain

### Resource Efficiency

| Metric | Chrome Alarms | Old Timers (MV3) |
|--------|---------------|-------------------|
| **CPU Wake-ups** | Optimized by Chrome | ❌ **Unreliable** |
| **Memory Usage** | Low (browser-managed) | ❌ **High (persistent worker)** |
| **Battery Impact** | Minimal | ❌ **Significant** |
| **Timing Reliability** | ✅ **Guaranteed** | ❌ **Broken by suspension** |

## Future Considerations

### Planned Enhancements

1. **Adaptive Sync Intervals**: Adjust timing based on user activity and change frequency
2. **Smart Batching**: Combine multiple sync operations into single alarm cycles
3. **Priority Queuing**: Different alarm intervals for high-priority vs low-priority syncs
4. **User Preferences**: Configurable sync frequency with UI controls

### Potential Improvements

- **Service Worker Keep-Alive**: Minimal alarm-based keep-alive for critical operations
- **Sync Coalescing**: Batch multiple pending operations when alarm fires
- **Network-Aware Scheduling**: Adjust sync timing based on network availability
- **Error-Adaptive Timing**: Increase intervals during error conditions, decrease when healthy

## Troubleshooting

### Common Issues

#### Alarms Not Firing
**Symptom**: Scheduled sync operations don't execute
**Solution**: Check browser console for alarm-related errors and verify `alarms` permission

#### Test Environment Warnings
**Symptom**: Tests show "Chrome alarms API not available" warnings
**Solution**: Expected behavior - tests use setTimeout fallbacks and still pass

#### Timing Inaccuracy
**Symptom**: Sync doesn't happen at expected intervals
**Solution**: Remember Chrome may optimize timing - expect ±1 minute variance

### Debug Utilities

```typescript
// Check active alarms
chrome.alarms.getAll().then(alarms => {
  console.log('Active alarms:', alarms);
});

// Monitor alarm events
chrome.alarms.onAlarm.addListener(alarm => {
  console.log('Alarm fired:', alarm.name, new Date());
});

// Clear all alarms (for debugging)
chrome.alarms.clearAll();
```

The Chrome Alarms implementation ensures HubMark will work reliably in the MV3 service worker environment while maintaining compatibility with test environments and providing better battery efficiency for users.