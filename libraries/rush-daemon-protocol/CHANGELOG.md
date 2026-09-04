# Change Log - @rushstack/rush-daemon-protocol

This log was last generated on Fri, 04 Sep 2026 15:17:14 GMT and should not be manually modified.

## 0.4.0
Fri, 04 Sep 2026 15:17:14 GMT

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

