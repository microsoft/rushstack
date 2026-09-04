# Change Log - @rushstack/rush-daemon-transport

This log was last generated on Fri, 04 Sep 2026 20:30:51 GMT and should not be manually modified.

## 0.3.0
Fri, 04 Sep 2026 20:30:51 GMT

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

