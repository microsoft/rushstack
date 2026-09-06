# Change Log - @rushstack/rush-daemon

This log was last generated on Sat, 05 Sep 2026 00:15:08 GMT and should not be manually modified.

## 0.5.0
Sat, 05 Sep 2026 00:15:08 GMT

### Minor changes

- Add authoritative Rush-compatible command result policy and ordered exact-once final result delivery for phased and global requests.
- Add an opt-in isolated execution context for caller-resolved global commands.
- Route request-scoped interactive input and signal PTY-only in-process fallback.
- Classify parsed built-in commands and admit phased and global requests through bounded workspace and graph scheduling.
- Add an opt-in phased request router that validates a caller-resolved selection, reconciles warm invalidations, runs one real graph iteration, scopes ordered streams and events to the client, and safely aborts on cancellation or disconnect.
- Merge compatible shared-build requests into one warm operation-graph iteration.
- Add an opt-in all-project engine component factory with explicit phase/plugin shape, retained invalidation reconciliation, fail-closed graph recreation boundaries, and a deterministic engine shutdown contract.
- Wire validated request lifecycles through shared warm host sessions and typed request resolvers.

## 0.4.1
Fri, 21 Aug 2026 15:16:34 GMT

_Version update only_

## 0.4.0
Fri, 21 Aug 2026 00:15:58 GMT

### Minor changes

- Add a reusable warm workspace session with stable Rush configuration metadata, retained headless invalidations, and deterministic host lifecycle integration.

## 0.3.0
Thu, 20 Aug 2026 00:16:38 GMT

### Minor changes

- Add the rushd executable and workspace-keyed daemon host bootstrap with handshake, liveness, readiness, and clean shutdown lifecycle.

### Patches

- Compile package output for ES2022.

## 0.2.0
Tue, 18 Aug 2026 00:18:33 GMT

### Minor changes

- Add the initial daemon request scheduler.

