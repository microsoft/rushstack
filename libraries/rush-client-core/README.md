# @rushstack/rush-client-core

Opt-in clients for the Rush daemon wire protocol: request lifecycle requires 0.5;
shutdown requires 0.6; stdin admission, write credits, and EOF require 0.7.
Later additive minors do not raise the request minimum.
This package has no
`rush-lib` dependency, command parser, operation graph, or presentation layer.

`captureDaemonRequest()` copies and freezes argv, cwd, environment, terminal
capabilities and admission settings before startup. `DaemonClient.connectAsync()`
negotiates hello, subscribes capabilities, and awaits a matching pong.
`executeAsync()` uses one fresh connection per invocation and closes it after the
authoritative result. Async stdout/stderr/event callbacks are awaited in wire order,
so slow destinations backpressure the transport. Log callbacks receive raw bytes
and the protocol's operation ID. The calling client owns terminal presentation.

Abort signals send `requestCancel`, then wait for the result; cancellation has a
bounded grace period. Disconnects, protocol errors and sink failures are errors,
never reasons to replay possibly executed work. Only pre-execution `unsupported`,
`controllingTerminalRequired`, and `stdinEndUnsupported` outcomes permit fallback. Raw-mode changes are
acknowledged only after applying them. Input listeners and raw state are restored
on success, cancellation, disconnect and failure. No resize messages are sent.

`connectOrStartDaemonAsync()` accepts an **explicit, version-selected** executable,
arguments, environment and cwd. It does not discover or install a Rush version.
It reuses transport paths/reclaim checks and node-core-library's process-identity
aware `LockFile` for the first-start mutex. The winning client rechecks readiness,
reclaims only an absent/dead owner, spawns detached without a shell, and waits for
hello/pong under bounded backoff. Stdout/stderr go to `<lockfilePath>.log`. No PID
is killed; a live (possibly reused) PID with an unreachable socket fails closed.

If a wire-compatible daemon reports the wrong implementation version and an explicit
replacement launcher is available, startup serializes replacement under that same mutex.
It verifies the old endpoint's attested ownership, requests shutdown, waits for ownership
release, and starts or reuses the expected version before returning a client. Concurrent
callers share one replacement; no command is submitted to the old version or replayed.
Passive clients never replace a daemon, and unverifiable ownership or unsupported lifecycle
protocol fails closed. `requestDaemonShutdownAsync()` is the shared ownership-checked
shutdown primitive used by both this path and explicit CLI restart.

`getDaemonLogFilePath(paths)` is the shared stable path used by both the launcher
and the CLI's local `daemon logs` reader. Child stdout/stderr are appended across
restarts, including startup failures; the parent always closes its descriptor
after spawn or failure. On POSIX the launcher enforces `0600` permissions on a
regular, unshared, current-user-owned file and refuses symlink destinations.
This is a text launcher log, not structured request observability.

`shutdownAsync()` requires a fresh connection with negotiated minor >= 6. It sends
the existing `shutdown` control and resolves only after `shutdownAck` and EOF,
with a bounded timeout. This is acceptance plus connection closure, **not** proof
of successful workspace disposal.

After acknowledged shutdown, `previousDaemon` on `connectOrStartDaemonAsync()`
identifies the original ownership record by its `pid` and `startedAt`, captured
before sending shutdown. Startup waits until that record disappears, another
owner replaces it, or its owner is demonstrably dead. A new owner is checked by
hello/ping; it is never blindly reclaimed. Signal 0 is only a liveness probe; no
process is killed. A live/reused owner times out conservatively, while corrupt or
unreadable metadata fails closed.

This relies on the two-phase host close contract: admission stops first, ownership
is retained through workspace disposal, and successful cleanup releases it.
Failed cleanup retains live ownership and prevents restart. Embedded hosts may
therefore release a workspace without exiting their process, and late repeated
close calls cannot remove successor artifacts.

## Integration boundaries

Protocol 0.7 negotiates `supportsInputLifecycle`. Input remains untouched until the
host attaches a destination and grants the first `stdinReady` credit. Each credit
permits one chunk, bounded to 64 KiB; the next credit follows the destination's
completed write. This bounds buffering without blocking cancellation or raw-mode
control frames. `stdinEnd` follows all preceding chunks and credits, including for
empty input. Raw Ctrl+C handling is opt-in and must not be enabled for binary pipes.
Set `requiresStdinEnd` for pipes: peers without the capability return
`stdinEndUnsupported` before sending `requestStart` or consuming any input.
Legacy 0.5/0.6 interactive clients retain their raw-mode/terminal-policy input path.

The standalone host has no request resolver or warm operation graph. A successful
handshake is readiness, not evidence that a build is supported. Graph verbs,
version-selected daemon installation, incompatible-protocol replacement, and
request handoff remain unavailable; this package does not fabricate them.
A client that dies during the
pre-bind spawn interval may leave a detached child still starting; normal
concurrent first-invocations are serialized, but crash-safe spawn handoff requires
a host-owned startup record/readiness handoff beyond the existing contracts.
