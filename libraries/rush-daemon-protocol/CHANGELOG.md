# Change Log - @rushstack/rush-daemon-protocol

This log was last generated on Thu, 24 Sep 2026 18:16:59 GMT and should not be manually modified.

## 0.5.0
Thu, 24 Sep 2026 18:16:59 GMT

### Minor changes

- Add generation-fenced experimental graph mutations in protocol 0.9.
- Add protocol 0.10 native mutation and guaranteed pre-execution restart results.
- Define JSON-safe experimental graph snapshot DTOs and the rushd.graph-snapshot extension name without changing transport contracts or runtime dependencies.
- Add protocol 0.6 acknowledged shutdown controls and optional process identity and resident-memory status fields.
- Add the validated optional Rush/Rushx invocation kind in protocol 0.8 without changing legacy request routing.
- Add protocol 0.7 stdin admission/write-credit and EOF controls with explicit capability negotiation.
- Add optional validated raw warm-project ranking inputs to workspace status while preserving unknown measurements and older-peer compatibility.

### Patches

- Report and validate the effective watch setting in warm status configuration while accepting its omission by older peers.
- Add optional validated lastReloadTier workspace status metadata for initial/reuse, successful reload, and requested restart; accept omission by older peers.
- Add optional validated workspace generation and warm-resource accounting to pong without changing request/rejection types or the protocol 0.9 generation-fencing contract.

## 0.4.2
Tue, 22 Sep 2026 17:35:41 GMT

_Version update only_

## 0.4.1
Mon, 14 Sep 2026 22:42:32 GMT

_Version update only_

## 0.4.0
Sat, 05 Sep 2026 00:15:08 GMT

### Minor changes

- Add a typed final daemon command result with Rush-compatible outcome and exit-code semantics.
- Add request-scoped stdin, raw-mode control, and terminal fallback contracts.
- Add typed resolved phased-request, enabled-state selection, engine-shape, and client-scoped operation result contracts.
- Add parsed command origin, request admission options, queue progress messages, and typed admission failures.
- Add validated request start, cancellation, rejection, and terminal result wire controls.

## 0.3.1
Fri, 21 Aug 2026 15:16:34 GMT

_Version update only_

## 0.3.0
Thu, 20 Aug 2026 00:16:38 GMT

### Minor changes

- Include daemon and protocol version metadata in pong control messages.

## 0.2.0
Tue, 18 Aug 2026 00:18:33 GMT

### Minor changes

- Initial release: rushd wire frame taxonomy (0x01-0x05), length-prefixed binary codec, DAEMON_PROTOCOL_VERSION, hello/version negotiation with typed mismatch errors, placeholder event envelope mirroring @rushstack/reporter, and per-subscription verbosity filtering.

