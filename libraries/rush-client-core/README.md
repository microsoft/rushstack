# @rushstack/rush-client-core

Opt-in clients for the Rush daemon wire protocol: request lifecycle requires 0.5;
shutdown requires 0.6; stdin admission, write credits, and EOF require 0.7.
Explicit Rushx invocation selection requires 0.8.
Native install/update and guaranteed pre-execution restart results require 0.10.
Later additive minors do not raise the request minimum.
This package has no
`rush-lib` dependency, command parser, operation graph, or presentation layer.

`captureDaemonRequest()` copies and freezes argv, cwd, environment, terminal
capabilities and admission settings before startup. `DaemonClient.connectAsync()`
negotiates hello, subscribes capabilities, and awaits a matching pong.
`executeAsync()` uses one fresh connection per invocation and closes it after the
authoritative result. On POSIX, a request to a peer before 0.12 leaves out `XDG_RUNTIME_DIR`,
`TMPDIR`, `TMP` and `TEMP`, because such a daemon restarts into the runtime folder they name,
where current clients never look; its operations see the daemon's own values. Async stdout/stderr/event callbacks are awaited in wire order,
so slow destinations backpressure the transport. Log callbacks receive raw bytes
and the protocol's operation ID. The calling client owns terminal presentation.

The optional `invocationKind` is captured unchanged. This core does not infer it from
command names or custom origin. Rushx requests fall back on older peers before sending
`requestStart`, even for TTY input. A peer cannot request fallback after emitting output
or admitting stdin: that is a protocol error, not permission to replay the command.

Abort signals send `requestCancel`, then wait for the result; cancellation has a
bounded grace period. Disconnects, protocol errors and sink failures are errors,
never reasons to replay possibly executed work. Only pre-execution `unsupported`,
`controllingTerminalRequired`, `stdinEndUnsupported`, and `restartRetriesExhausted` outcomes permit fallback. Raw-mode changes are
acknowledged only after applying them. Input listeners and raw state are restored
on success, cancellation, disconnect and failure. No resize messages are sent.

`executeWithDaemonRestartAsync(readyClient, connectionOptions, executionOptions)`
retries an explicit `retryAfterRestart: true` result a bounded number of times. Before
each hand-off it captures the endpoint's PID/start identity, requires protocol 0.10,
waits for that ownership to be released, and reconnects through the same startup mutex.
The restarting daemon launches the successor it selected after that release, so while
its process lives the client only connects: starting a daemon itself could win the
startup mutex with the client's own environment instead of the one the restart was for.
It starts one only if that process exits without a ready successor.
Retries after the first use jittered backoff, and the backoff, the successor hand-off
and the resubmitted request all share the request's admission deadline.
The original immutable request and unread input are preserved. Output, events,
terminal control, or stdin admission forbid retry, as do connection loss and plain
error messages. When the retry bound or the admission deadline is exhausted, it
returns a `restartRetriesExhausted` fallback outcome so the caller can run in-process.
Cancellation stops waiting without killing a daemon. Disabling auto-start still
permits waiting for a host-started successor, but never lets the client spawn one.
A result may say why the daemon restarts (`restartReason`); for `installationChanged`,
the daemon's installation was removed or replaced, so it exits without a successor and
the client's own `startCommand` starts one. Such a daemon answers only once the requests
ahead of the request finish; meanwhile `onQueuePositionAsync` gets the reason as its second
argument. It does so for each request that waits for a restart, with the wait's details as its
third argument: `scriptCount`, how many of the requests ahead run a rushx script, and
`restartsForAnotherRequest`, set for a rushx script that waits for another request's restart.
`formatDaemonRestartCause` words a reason as the end of "the daemon restarts ...", for the
request or for such a script, and `onInputAdmittedAsync` reports when the daemon first admits
the request's input, which for a rushx script is when the script starts. After each hand-off
to a ready successor, the optional `onRestartAsync` callback gets the restart number, the
reason (`undefined` when the daemon gave none, as older daemons do) and the successor's PID,
before the request is resubmitted.

A connection lost before the result stays a `disconnected` `DaemonClientError`. Its message
starts with "Daemon disconnected before delivering a result; the command was not retried."
and `executeWithDaemonRestartAsync()` appends what happened to the daemon that served the
attempt, identified by its pong PID. If that process exited within about a second (on Linux,
an exited process that is not reaped yet counts), the message names the PID, `rush-client
daemon logs` and `--no-daemon` (`rushx-client` for Rushx requests), and adds a second line
with the first fatal error that `<lockfilePath>.log` gained after the request was sent: a
Node.js uncaught-exception report or a V8 `FATAL ERROR:` line, clipped to one printable line.
Before it returns that error, it reclaims the exited daemon as the next daemon start would, so
running the command again, with or without the daemon, does not race the operations the daemon
left running. While the ownership record names that process, it takes the start mutex and, unless
a startup is reserved, calls `reclaimStaleDaemonAsync()`, which terminates the orphaned operation
process groups (and those that other dead daemons recorded but that no ownership record names any
more) and removes the ownership record and socket. Where `/proc` shows that every process left in a
group has exited but is not reaped yet (a zombie), the group counts as stopped, because no signal
can end it. Each set of groups that it stops is
passed to the connection's optional `onOrphansReaped(reap)` (the daemon's PID, the process groups,
and whether they were `terminated` or `killed`), so that the caller can say so in its own words;
without it, each is reported as a `RUSH_DAEMON_ORPHANS_REAPED` process warning. The reclaim before
a daemon start reports the same way. It waits up to 5 seconds while another client holds the start
mutex, or while the exited process is not reaped yet. If the reclaim fails or times out, the
message is the same, and the next daemon start reclaims the daemon instead.
If the process still runs, the message says that only the connection closed. After the abort
signal fires, the error is unchanged, so the caller reports the cancellation.

`connectOrStartDaemonAsync()` accepts an **explicit, version-selected** executable,
arguments, environment and cwd. It does not discover or install a Rush version.
It adds `RUSHD_RUNTIME_DIR`, set to the base of `paths.runtimeDir`, to that environment, so the
daemon resolves the same paths as its clients whatever environment it inherits.
A runtime folder that is a symbolic link, is not a directory or belongs to another user, or
whose socket path is too long for a socket address (from a long `RUSHD_RUNTIME_DIR`), is
refused as `startupFailed` before anything in it is trusted or created
(`assertDaemonRuntimeFolderIsPrivate()`); one that others can open is made owner-only.
It reuses transport paths/reclaim checks and node-core-library's process-identity
aware `LockFile` for the first-start mutex, including kernel-enforced exclusive
file sharing on Windows. The winning client rechecks readiness,
reclaims only an absent/dead owner, spawns a detached startup helper, and reserves
`<lockfilePath>.starting` for it (recording the helper's PID and start time) before
handing it the explicit command. The helper spawns the launcher without
a shell and retains that reservation until the daemon completes hello/ping readiness,
independently of whether the requesting client survives. It waits for a live launcher for
at least 120 seconds, even when the requesting client's own deadline is shorter, so a slow
first start (for example while Windows scans newly installed files) is still handed off to
later clients instead of leaving an abandoned reservation. Clients still await
hello/pong under bounded backoff. Stdout/stderr go to `<lockfilePath>.log`. No PID
is killed. While holding the mutex with no startup reservation (or after taking over an
abandoned one, see below), stale leftovers are reclaimed only when provably safe: a socket without an ownership record, or a corrupt
record, once a connection attempt is refused (no listener exists); and, on Linux, a
record whose PID now belongs to a process that started after the record's `startedAt`
(PID reuse, detected from `/proc`). Any other live PID with an unreachable socket fails
closed, pointing to `resetDaemonArtifactsAsync()` (`rush-client daemon stop --force`),
which removes the record, socket and reservation after the same no-listener/no-live-owner checks.
When the recorded PID no longer exists, the reset first stops the operations that the owner left
running, as `reclaimStaleDaemonAsync()` does before the next start, and reports them to
`options.onOrphansReaped` (or else as `RUSH_DAEMON_ORPHANS_REAPED` warnings). It removes nothing when
they cannot be stopped, and it never signals a process otherwise.
The helper uses a stable tool cwd, and the starting client awaits its exit after
readiness. The explicit launcher's cwd is unchanged. If the daemon exits after its helper saw it ready
but before the starting client connected, for example because `rush-client daemon stop` stopped it,
the client fails with `startupFailed` at once instead of at its deadline: the helper has exited 0, and
neither an ownership record nor a startup reservation remains.

While its helper runs, a startup reservation is never taken over, however long startup
takes. Only a known spawn failure (no executable started) releases the reservation
immediately. If the helper cannot establish readiness (its launcher exited, or it timed
out), it exits and leaves the reservation. An arbitrary launcher can spawn descendants, so
neither exit proves that no daemon can still publish an endpoint. A reservation whose helper
is provably gone is therefore taken over only once its relaunch time has passed (15 seconds
after the helper was launched) and while nothing listens at the endpoint; the starting client
logs that it took the reservation over and launches the daemon again. This is safe even if a
daemon of the gone helper is still starting: a daemon listens before it publishes the endpoint,
publishes it only with link(2) (or as the first instance of a named pipe), and reclaims it
only from a dead owner that does not accept a connection. So of two such daemons, the one
that publishes second finds the other and exits, and the readiness of either releases the new
reservation. Before the relaunch time, clients refuse another launch at once, so that a
daemon that fails the same way each time (for example because of a configuration error) is
not launched by every client, and their callers can run without it. Normal successful startup
releases the reservation automatically. Cancellation stops the client waiting, not the
detached handoff.

A client resolves a reservation on the same evidence the helper waits for, so a daemon
that became ready after its helper stopped waiting (for example a first start slower than
120 seconds) is still used: holding the start mutex, the client needs a daemon that
completes hello/ping at the endpoint and whose pong PID is the live owner in the
ownership record for that socket, and it removes the reservation only if it is unchanged.
Reservations written by older clients, without a helper, are resolved the same way.
The recorded helper decides how long a refused launch waits: while it is alive, a starting
client waits for it until the client's own deadline; once it is provably gone (its PID
no longer exists or was reused), nothing else can release the reservation, so clients
refuse another launch at once until the relaunch time, and then take the reservation over
as described above (while something listens at the endpoint, they wait for it until their
deadline instead). `inspectDaemonStartupReservation(paths)` reports the reservation, its
helper's state and, once the helper exited, the relaunch time (`relaunchAfter`) without
changing it (`rush-client daemon status`), and
`requestDaemonShutdownAsync()` resolves a reservation for the attested daemon before it
sends shutdown, so that its successor can start. `resolveDaemonStartupReservationAsync(client,
paths)` does the same for a caller that stops the daemon without replacing it (`rush-client
daemon stop`): it returns false and keeps the reservation when the daemon is not the attested
owner, the reservation changed, or another client holds the start mutex past the timeout.

If a wire-compatible daemon reports the wrong implementation version and an explicit
replacement launcher is available, startup serializes replacement under that same mutex.
It verifies the old endpoint's attested ownership, requests shutdown, waits for ownership
release, and starts or reuses the expected version before returning a client. Concurrent
callers share one replacement; no command is submitted to the old version or replayed.
Passive clients never replace a daemon, and unverifiable ownership or unsupported lifecycle
protocol fails closed. `requestDaemonShutdownAsync()` is the shared ownership-checked
shutdown primitive used by both this path and explicit CLI restart.
Socket resets and broken pipes during hello/ping readiness are retried within the same startup deadline:
a closing host may still retain its listener while joining owned resources. This applies only before
`requestStart`; a connection failure after execution begins still never permits replay.

`connectOrAwaitDaemonStartupAsync()` wraps `connectOrStartDaemonAsync()` for a caller that runs Rush
in-process when no daemon is available, as the CLI client does. A `startupFailed` or `timeout` error
alone does not make that safe while a live process can still make the daemon ready: a listener at the
endpoint that did not complete hello/ping in time, a recorded startup helper that is still running, or
another client that holds the start mutex. In-process Rush would take the repository lock that the
daemon's requests need. The wrapper instead keeps connecting (and starting, through the same mutex and
reservation) until one more startup deadline has passed. If the daemon is still not ready, it rejects
with `DaemonStartupPendingError`, which is not a `DaemonClientError`: the message is the startup error
followed by the process that is still live, and `cause` is that error. When none remains, it rejects at
once with the original `DaemonClientError`, for example when auto-start is disabled and nothing listens,
or when the helper has exited. An ownership record alone does not count, because a daemon publishes it
only after binding. Other errors, such as `versionMismatch`, pass through unchanged. Before it keeps
waiting, it calls the optional `onAwaitStartup(owner, waitMs)` once, with the live process and the
remaining wait, so that the caller can say why the command has not started yet.

`connectToStartingDaemonAsync()` connects without starting anything, for a caller that must not leave
a daemon running, such as `rush-client daemon stop`. One refused connection does not show that no daemon
runs: while one of the same live processes can still make a daemon ready at the endpoint, it waits up
to one startup deadline for that daemon and connects once it completes hello/ping, whatever its
implementation version. It resolves `undefined` when nothing listens and none of those processes
remains, and rejects with `DaemonStartupPendingError` when one is still live at the deadline. It calls
`onAwaitStartup(owner, waitMs)` once before it waits.

`reclaimCrashedDaemonAsync(paths)` is for a caller that is about to run Rush in-process, as the CLI
client does for `--no-daemon` and for each fallback. A daemon that crashed or was killed while it ran
a command leaves its operations running, and they could overwrite the in-process command's outputs.
When the ownership record names a PID that no longer exists (on Linux, also an exited process that is
not reaped yet), it reclaims that daemon as described above for a lost connection: under the start
mutex, only when no startup is reserved, and waiting up to 5 seconds. It does nothing when there is no
record, when a process with the recorded PID runs, or when the runtime folder is not private, and it
never throws. Its optional `options.onOrphansReaped` receives what it stopped, as above.

`getDaemonLogFilePath(paths)` is the shared stable path used by both the launcher
and the CLI's local `daemon logs` reader. Child stdout/stderr are appended across
restarts, including startup failures; the parent always closes its descriptor
after spawn or failure. On POSIX the launcher enforces `0600` permissions on a
regular, unshared, current-user-owned file and refuses symlink destinations.
This is a text launcher log, not structured request observability. A client that reclaims a daemon
that exited without shutting down, after a lost connection or in `reclaimCrashedDaemonAsync()`,
appends a line that names the daemon's PID to it, under the same file checks. Once the reclaim has
removed the ownership record, `findReclaimedDaemonPid(paths)` returns that PID from the log's last
64 KiB, unless a daemon wrote its `rushd ready at` line after it or `resetDaemonArtifactsAsync()`
cleared the report with a line of its own; `rush-client daemon status` uses it.

`shutdownAsync()` requires a fresh connection with negotiated minor >= 6. It sends
the existing `shutdown` control and resolves only after `shutdownAck` and EOF,
with a bounded timeout. This is acceptance plus connection closure, **not** proof
of successful workspace disposal.

After acknowledged shutdown, `previousDaemon` on `connectOrStartDaemonAsync()`
identifies the original ownership record by its `pid` and `startedAt`, captured
before sending shutdown. Startup waits until that record disappears, another
owner replaces it, or its owner is demonstrably dead. A new owner is checked by
hello/ping; it is never blindly reclaimed. Signal 0 is only a liveness probe; no
process is killed. A live owner times out conservatively (a Linux PID provably reused
since `startedAt` counts as dead), while corrupt or
unreadable metadata fails closed.
During a captured predecessor handoff, transient Windows sharing-denied reads stay
unknown and are retried only within the existing startup deadline. They never
authorize reclamation; malformed records still fail immediately.

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

The standalone host supports native phased builds and the experimental structured
graph reference client. A successful handshake is still transport readiness, not a
guarantee that every command or configuration is supported. Version-selected daemon
installation and incompatible-protocol replacement remain
separate integration work; this core package does not construct an engine.
The startup helper and durable pre-bind reservation protect concurrent first-invocations
even if the original client dies. They do not add a new daemon protocol or authorize
automatic recovery of ambiguous launcher failures.
