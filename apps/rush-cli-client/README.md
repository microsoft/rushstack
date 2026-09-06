# @rushstack/rush-cli-client

Separate `rush-client` and `rushx-client` binaries, opt-in until cutover. Existing
`rush`, `rushx`, and their reporter entrypoints are unchanged.

Routing precedence:

1. `--no-daemon` before `--`, help, and never-daemonize commands stay in-process.
2. CI stays in-process unless `RUSH_DAEMON=1` explicitly opts in, even if config enables the daemon.
3. `RUSH_DAEMON` overrides `rush.json`'s `daemon.enabled`; the default is false.
4. Auto-start is considered only after selecting daemon execution.

`--no-wait` fails immediately when daemon admission is unavailable.
`--wait-timeout SECONDS` (or `--wait-timeout=SECONDS`) overrides the configured queue
timeout; finite nonnegative decimal seconds up to 2147483.647 are accepted and
rounded down to milliseconds. These controls are mutually exclusive and are
consumed before forwarding, never appended to a project script. Arguments after
`--` remain literal script arguments.

Admission controls also apply to experimental graph requests, but not
`start|stop|restart|status|logs`. They affect daemon admission only; native fallback
retains native command behavior. Waiting positions are shown on interactive stderr,
and admission failures report their typed reason and a nonzero exit code.

Explicit reporter/output/log-level controls retain the native frontend reporter path.
The current daemon client renders the legacy operation stream; it does not silently
reinterpret requests for JSON, AI, file, or other reporter formats.

`install`, `update`, package mutation, publishing, setup, management, and other
administrative commands are never forwarded as execution requests. Rushx script names
are not interpreted as Rush built-ins. Arguments after `--` are preserved.
Request cwd, environment, argv, width and color are captured before connecting.
The protocol currently expresses request color as a boolean; subscriptions carry
the corresponding color level. There is no SIGWINCH forwarding.

The standalone host now binds native `build`/`rebuild` requests to a reusable
all-project graph. Native Rush parsing, project selection, graph plugins, and
incremental/cache semantics are reused rather than spawning another Rush CLI.
The client renders operation headers, collated text, and activity events; global
command byte streams remain byte-preserving. A `rushx build` script never claims
to be a workspace build.

The initial engine is pinned to its startup environment, first command, and
non-selection parameters. Direct, inherited, and rig-based project configuration
uses private native loaders and is rechecked before execution. External plugins,
`.env`, watch/install options, and unsupported event-hook scripts still use typed
pre-execution fallback. The native Rush lock is held for preparation and each
coalesced iteration, not while idle; native commands and `--no-daemon` can run
after a completed request without stopping the daemon. Unknown rejections,
transport loss after sending a request, and output failures never replay work.

Piped input uses protocol 0.7's negotiated stdin admission and EOF. The client does
not read input until the command attaches an input destination, and sends bounded
chunks only as the daemon grants write credits. EOF follows all preceding writes;
binary Ctrl+C bytes in a pipe are data, not cancellation signals. Older peers fall
back before `requestStart` or input consumption, and pre-execution command fallback
preserves the complete pipe for the native entrypoint.
The existing Rush entrypoints resolve project scripts from cwd. Fallback loads the
existing `@microsoft/rush` version-selecting entrypoint in the client process,
preserving its startup checks, output and reporter integration instead of
inventing a cached module path. A different selected Rush version has no daemon launcher integration
yet. Older Rush versions may also reject the new `daemon` config block; use
environment-only opt-in until a supporting Rush release is selected.

## Configuration

Every setting uses **environment > config > default**. Boolean overrides accept
only `0`/`1`; numeric overrides accept finite unsigned decimal numbers. Unknown
keys and unknown `RUSH_DAEMON*` variables fail validation.

| `daemon` key | Environment override | Default | Runtime status |
| --- | --- | --- | --- |
| `enabled` | `RUSH_DAEMON` | false | Client routing |
| `autoStart` | `RUSH_DAEMON_AUTO_START` | true | Only after opt-in |
| `idleTimeoutSeconds` | `RUSH_DAEMON_IDLE_TIMEOUT_SECONDS` | 900 | Forwarded at startup for the WS3 host to enforce |
| `queueTimeoutSeconds` | `RUSH_DAEMON_QUEUE_TIMEOUT_SECONDS` | 30 | Sent through existing admission contract |
| `watch` | `RUSH_DAEMON_WATCH` | false | Validated, inactive integration seam |
| `warmIdleTimeoutSeconds` | `RUSH_DAEMON_WARM_IDLE_TIMEOUT_SECONDS` | 300 | Validated, inactive integration seam |
| `warmMemoryBudgetMB` | `RUSH_DAEMON_WARM_MEMORY_BUDGET_MB` | 512 | Validated, inactive integration seam |
| `warmSetMaxProjects` | `RUSH_DAEMON_WARM_SET_MAX_PROJECTS` | 20 | Validated, inactive integration seam |
| `autoWarmByTelemetry` | `RUSH_DAEMON_AUTO_WARM_BY_TELEMETRY` | false | Validated, inactive integration seam |

Timeouts must be positive and at most 2147483.647 seconds; queue timeout additionally
accepts zero and is rounded down to milliseconds. Memory budget must be positive
and no larger than JavaScript's maximum safe integer. Project count must be a
positive safe integer. No warm-set setting changes build correctness.

## Management

`rush-client daemon start` explicitly requests startup, independently of
`daemon.enabled`, `autoStart`, or CI execution routing. It conflicts with
`--no-daemon`. It is idempotent: an existing compatible daemon is reused, not
reconfigured. Startup uses the same detached, locked launcher as automatic
startup and fails rather than guessing a launcher for another Rush version.
With an explicit matching launcher, a daemon implementation-version mismatch triggers
ownership-checked replacement under the start mutex before executing any command.
This does not install another Rush version or replace a peer lacking safe shutdown support.

`rush-client daemon status` only connects and checks hello/pong. It never starts
a process, reclaims files, or treats a PID file as evidence of readiness. Both
commands print one JSON object with `state: "ready"`, `socketPath`, and the actual
pong fields (`uptimeMs`, available versions, and optional `pid` and
`residentMemoryBytes`). Exit code 0 means protocol
readiness, not build support. An unreachable/incompatible endpoint, invalid
arguments, or startup failure returns exit code 1 with a diagnostic.

Warm projects and reload tier are not reported because the current pong does not
attest them. Status can inspect a protocol-compatible
daemon with a different implementation version; start requires the bundled
version to match.

`rush-client daemon stop` requires protocol >= 0.6 and waits for `shutdownAck`
followed by EOF. It reports `state: "shutdownAccepted"` with exit code 0; this
does not assert successful workspace disposal. An absent/unreachable daemon,
unsupported protocol, missing acknowledgement, or timeout returns exit code 1.
It does not auto-start anything.

`rush-client daemon restart` first verifies that the selected Rush version has a
launcher and captures the original lock's PID/start timestamp, checking that it
matches pong's positive PID and the selected endpoint, then performs acknowledged
shutdown. It waits for original ownership release or a demonstrably dead owner
before calling the existing locked starter. A live/reused owner fails closed at
the startup deadline; no PID is killed and no live ownership record is deleted.
A newly
started/reused successor must pass hello/ping before reporting `state: "ready"`.
An absent daemon must be started explicitly with `daemon start`.

Restart is explicit even when automatic startup or CI execution routing is
disabled, but conflicts with `--no-daemon`. The two-phase host retains ownership
until workspace disposal succeeds, so embedded hosts can restart a workspace
without exiting their process. Failed cleanup retains the live lock and causes a
bounded restart failure, even if the socket has already disappeared. A changed
owner is reconnected and validated, not overwritten.

`rush-client daemon logs` prints a snapshot of the selected workspace's launcher
log, whether the daemon is running or stopped. It never connects or auto-starts.
The stable path comes from `getDaemonLogFilePath(paths)`: `<lockfilePath>.log`.
Detached child stdout and stderr are appended to this file across restarts; the
parent closes its descriptor after spawning. On POSIX the launcher enforces mode
`0600` and rejects linked destinations; Windows uses the existing per-user
transport directory permissions.

Reading is bounded to the size observed when the log is opened, with chunked,
backpressured output. Empty logs succeed without output; missing/unreadable logs
or invalid destinations fail with a diagnostic and exit code 1. A launcher log
may not exist for a daemon started outside this client. No `--follow` or rotation
policy is added.

This is the **text launcher stdout/stderr log**, including startup errors—not
WS5 structured observability or a subscription to request-scoped events.

## Experimental graph reference client

Set `RUSH_DAEMON_EXPERIMENTAL=1` and use an explicitly started daemon:

```sh
export RUSH_DAEMON_EXPERIMENTAL=1
rush-client daemon start
rush-client daemon graph show
rush-client build --to my-project
rush-client daemon graph scope-out --project my-project
rush-client daemon graph scope-in --operation 'my-project (compile)'
rush-client daemon graph invalidate --project my-project
rush-client daemon graph pause
rush-client daemon graph status
rush-client daemon graph resume
rush-client daemon graph watch
```

All graph commands connect only; they never auto-start, initialize the graph, or
fall back to native Rush. Cold `show` and `status` report `initialized: false`
without an `operations` field. Other verbs fail explicitly until a supported,
explicit build request has initialized the graph. The gate is checked both by the
CLI and against the server request's environment. Older or unsupported servers,
invalid arguments, and unknown selectors fail, never invoke a shell.

`show` and `status` both emit a complete point-in-time metadata snapshot, including
operation IDs, exact project/phase names, native enabled states, observed statuses,
dependency IDs, manual-mode/scheduled flags, and a path-free invalidation summary.
An operation without an observed execution status reports `null`. Snapshots contain
no environment, runner, log, or terminal objects.

`scope-in`, `scope-out`, and `invalidate` require one or more repeated
`--project NAME` or `--operation ID` pairs. Names and IDs match exactly; there are
no globs or implicit all-project selections. Every selector is validated before
any mutation. Scope-in enables transitive dependencies. Scope-out includes
transitive consumers and uses native safe-disable, which also prunes dependencies
no longer needed by enabled operations. Invalidation marks selected native results
stale without scheduling work. Mutations use exclusive workspace admission and
never change an active iteration. Scope changes/invalidation reject an already
prepared iteration instead of modifying stale execution records.

Pause/resume change native `pauseNextIteration`: manual mode gates automatically
scheduled iterations, **not explicit build requests**. Resume does not create new
work. If an engine owner has already prepared an automatic iteration, resume
acquires the native execution lease, discards the old unstarted plan, reconciles
inputs, and prepares its replacement before releasing it. Admission and the native
lease remain held until native idle, including
if the resume client disconnects. The reference client's watch command is not a
build scheduler; the default lazy engine still rebuilds only on explicit requests.
Native build requests apply their own selections, so a graph scope is not a
persistent override of later build arguments.

Graph stdout is NDJSON only. Snapshots use the existing `extension` event envelope
with `payload.name: "rushd.graph-snapshot"` and
`payload.data: { requestId, snapshot }`. The existing `requestResult` is emitted as
the terminal record; queue positions and request rejections also retain their
control-message shapes. Local failures use `{ kind: "graphError", message }`.
No human renderer, ANSI styling, or graph-specific transport is involved.

`watch` emits an initial snapshot followed by relevant graph state, invalidation,
and idle updates. It holds no scheduler lease, so other clients can build.
Slow consumers receive coalesced latest snapshots rather than every intermediate
transition or an unbounded event history. SIGINT/SIGTERM cancel the subscription
and wait for the authoritative aborted result (exit 130). Disconnect removes
subscriber resources without cancelling another client's build. Graph hooks are
installed once per graph, not once per connection.
