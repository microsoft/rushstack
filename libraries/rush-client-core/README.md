# @rushstack/rush-client-core

Opt-in clients for the Rush daemon wire protocol: request lifecycle requires 0.5;
shutdown requires 0.6. Later additive minors do not raise the request minimum.
This package has no
`rush-lib` dependency, command parser, operation graph, or presentation layer.

`captureDaemonRequest()` copies and freezes argv, cwd, environment, terminal
capabilities and admission settings before startup. `DaemonClient.connectAsync()`
negotiates hello, subscribes capabilities, and awaits a matching pong.
`executeAsync()` uses one fresh connection per invocation and closes it after the
authoritative result. Async stdout/stderr/event callbacks are awaited in wire order,
so slow destinations backpressure the transport. Log callbacks receive raw bytes
and the protocol's operation ID. The daemon owns terminal presentation.

Abort signals send `requestCancel`, then wait for the result; cancellation has a
bounded grace period. Disconnects, protocol errors and sink failures are errors,
never reasons to replay possibly executed work. Only typed `unsupported` and
`controllingTerminalRequired` outcomes permit fallback. Raw-mode changes are
acknowledged only after applying them. Input listeners and raw state are restored
on success, cancellation, disconnect and failure. No resize messages are sent.

`connectOrStartDaemonAsync()` accepts an **explicit, version-selected** executable,
arguments, environment and cwd. It does not discover or install a Rush version.
It reuses transport paths/reclaim checks and node-core-library's process-identity
aware `LockFile` for the first-start mutex. The winning client rechecks readiness,
reclaims only an absent/dead owner, spawns detached without a shell, and waits for
hello/pong under bounded backoff. Stdout/stderr go to `<lockfilePath>.log`. No PID
is killed; a live (possibly reused) PID with an unreachable socket fails closed.

`shutdownAsync()` requires a fresh connection with negotiated minor >= 6. It sends
the existing `shutdown` control and resolves only after `shutdownAck` and EOF,
with a bounded timeout. This is acceptance plus connection closure, **not** proof
of successful workspace disposal.

After acknowledged shutdown, `previousDaemonPid` on `connectOrStartDaemonAsync()`
waits for the original PID reported by pong to exit before touching transport
ownership or starting a successor. Signal 0 is only a liveness probe; no process
is killed. A live/reused PID times out conservatively. This stronger barrier is
needed because the current host removes transport artifacts before workspace
disposal finishes. Embedded hosts that keep their process alive cannot use this
restart path without a future cleanup-completion contract.

## Integration boundaries

The current protocol has no stdin EOF or normal request-admitted message.
Automatic stdin pumping therefore begins only on `setRawMode(enabled: true)` or
`terminalPolicy(runInDaemon)`. A host accepting cooked input must send the latter
before awaiting input. The current standalone host does not do so. Piped stdin
must remain in-process until explicit input admission/EOF are integrated.

The standalone host has no request resolver or warm operation graph. A successful
handshake is readiness, not evidence that a build is supported. Graph/log verbs,
version-selected daemon installation, transparent version-skew restart, and
request handoff remain unavailable; this package does not fabricate them.
A client that dies during the
pre-bind spawn interval may leave a detached child still starting; normal
concurrent first-invocations are serialized, but crash-safe spawn handoff requires
a host-owned startup record/readiness handoff beyond the existing contracts.
