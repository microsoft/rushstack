# @rushstack/rush-client-core

Opt-in clients for the existing Rush daemon 0.5 wire protocol. This package has no
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

## Integration boundaries

The current protocol has no stdin EOF or normal request-admitted message.
Automatic stdin pumping therefore begins only on `setRawMode(enabled: true)` or
`terminalPolicy(runInDaemon)`. A host accepting cooked input must send the latter
before awaiting input. The current standalone host does not do so. Piped stdin
must remain in-process until explicit input admission/EOF are integrated.

The standalone host has no request resolver or warm operation graph. A successful
handshake is readiness, not evidence that a build is supported. Management,
graph verbs, version-skew restart, and transparent handoff require real host
contracts; this package does not fabricate them. A client that dies during the
pre-bind spawn interval may leave a detached child still starting; normal
concurrent first-invocations are serialized, but crash-safe spawn handoff requires
a host-owned startup record/readiness handoff beyond the existing contracts.
