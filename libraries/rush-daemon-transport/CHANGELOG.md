# Change Log - @rushstack/rush-daemon-transport

This log was last generated on Thu, 24 Sep 2026 18:16:59 GMT and should not be manually modified.

## 0.4.0
Thu, 24 Sep 2026 18:16:59 GMT

### Minor changes

- Retain daemon ownership while connections stop, refuse a still-live owner, and make endpoint release idempotent across successor startup.

### Patches

- Close a newly bound endpoint if publishing daemon ownership fails, avoiding an orphaned listener after failed startup.

## 0.3.2
Tue, 22 Sep 2026 17:35:41 GMT

_Version update only_

## 0.3.1
Mon, 14 Sep 2026 22:42:32 GMT

_Version update only_

## 0.3.0
Sat, 05 Sep 2026 00:15:08 GMT

### Minor changes

- Serialize and backpressure asynchronous incoming frame handlers.

### Patches

- Add an internal abortive close path for stalled daemon connection shutdown.

## 0.2.2
Fri, 21 Aug 2026 15:16:34 GMT

_Version update only_

## 0.2.1
Thu, 20 Aug 2026 00:16:38 GMT

_Version update only_

## 0.2.0
Tue, 18 Aug 2026 00:18:33 GMT

### Minor changes

- Initial release: workspace-key hashing (sha256 of canonical root + rushVersion + startupOptions), per-user runtime-dir socket/pipe path derivation, net listener/connector with backpressure, and PID/lockfile handling with stale-socket reclaim.

