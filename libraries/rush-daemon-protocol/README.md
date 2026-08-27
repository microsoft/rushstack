# @rushstack/rush-daemon-protocol

> **Public beta** — this package is versioned at `0.x`; its API may change between minor versions.

The engine-agnostic **wire layer** spoken by every client of the Rush daemon (`rushd`):

- **Frame taxonomy** — five frame types: `0x01` control-json, `0x02` log-stdout,
  `0x03` log-stderr, `0x04` stdin, `0x05` event.
- **Length-prefixed binary codec** — a streaming serializer/deserializer that is lossless
  for arbitrary (including non-UTF-8) payloads and tolerant of arbitrarily split or
  coalesced chunks.
- **`DAEMON_PROTOCOL_VERSION`** — the negotiated protocol version constant.
- **Version negotiation** — a `hello`/`helloAck` handshake with a typed
  `ProtocolVersionMismatchError` on major-version mismatch.
- **Event contract** — the `0x05` frame payload envelope (currently a placeholder
  mirroring `@rushstack/reporter`'s `IReporterEventEnvelope`; to be replaced by a direct
  reference when the reporter package lands) plus namespaced `rushd.*` extension events.
- **Per-subscription verbosity** — a pure filter applied at event serialization so each
  client receives its own verbosity subset without mutating shared engine state.
- **Resolved phased-request contracts** — engine-agnostic request, enabled-state selection,
  and client-scoped result types for integrations that have already parsed a command and
  resolved it against a real warm operation graph.
- **Final command result contract** — one typed success, warning, failure, or abort outcome
  with the authoritative Rush-compatible exit code, delivered after request output drains.

Part of the Rush 6 / rushd re-architecture:
[microsoft/rushstack#5894](https://github.com/microsoft/rushstack/issues/5894).

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/libraries/rush-daemon-protocol/CHANGELOG.md) - Find
  out what's new in the latest version
- [API Reference](https://rushstack.io/pages/api/rush-daemon-protocol/)

`@rushstack/rush-daemon-protocol` is part of the **Rush Stack** family of projects.
