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
  parsed built-in/custom command origin, and client-scoped result types for integrations that
  have already parsed a command and resolved it against a real warm operation graph.
- **Final command result contract** — one typed success, warning, failure, or abort outcome
  with the authoritative Rush-compatible exit code, delivered after request output drains.
- **Interactive request contracts** — request-tagged stdin frames preserve arbitrary bytes, while
  acknowledged raw-mode controls and typed terminal-policy results remain scoped to one request.
- **Request admission contracts** — resolved no-wait and bounded-timeout options, typed admission
  failure codes, and capability-gated one-based queue-position control messages.
- **Request lifecycle contracts** — a validated presentation-free command envelope, cancellation,
  typed routing rejection/fallback, and one authoritative terminal result control. Command parsing
  and Rush action construction remain outside the protocol.
- **Daemon lifecycle controls (0.6)** — after a compatible `hello`, a client can send
  `shutdown` and receive `shutdownAck` before connection closure. Clients must negotiate at least
  `DAEMON_LIFECYCLE_PROTOCOL_MINOR` before sending this control. `pong` can also report the daemon's
  PID and resident memory in bytes; older peers may omit these fields.
- **Input lifecycle controls (0.7)** — `supportsInputLifecycle` negotiates `stdinReady`
  and `stdinEnd`. The host grants the first write credit only after the request attaches
  its input destination, then grants another after each write drains. The client sends
  one bounded chunk per credit and EOF after all chunks. Empty data is never interpreted
  as EOF. Peers that did not negotiate the capability receive no new controls.
- **Invocation kind (0.8)** - optional `invocationKind: "rush" | "rushx"` selects the
  native parser independently of `commandOrigin`. Omission retains legacy Rush
  routing; custom workspace commands are never inferred to be package scripts.
  A Rushx client must negotiate at least `DAEMON_INVOCATION_KIND_PROTOCOL_MINOR`
  before submitting its request. Older peers could ignore the discriminator,
  so the client falls back before `requestStart` or input consumption.
- **Graph generation fencing (0.9)** - graph snapshots carry an opaque
  `workspaceGeneration` token. Mutation requests must echo it in
  `expectedWorkspaceGeneration`; the server checks it under exclusive admission
  before touching operations. Tokens change on session or process replacement.
  Clients must negotiate `DAEMON_GRAPH_GENERATION_PROTOCOL_MINOR` before mutation;
  an older server could otherwise ignore the reference.

Part of the Rush 6 / rushd re-architecture:
[microsoft/rushstack#5894](https://github.com/microsoft/rushstack/issues/5894).

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/libraries/rush-daemon-protocol/CHANGELOG.md) - Find
  out what's new in the latest version
- [API Reference](https://rushstack.io/pages/api/rush-daemon-protocol/)

`@rushstack/rush-daemon-protocol` is part of the **Rush Stack** family of projects.
