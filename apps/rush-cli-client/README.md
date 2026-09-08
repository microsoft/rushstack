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

Positively identified built-in `install` and `update` follow the same opt-in routing
precedence as workspace builds and require protocol **0.10**
(`DAEMON_WORKSPACE_RESTART_PROTOCOL_MINOR`). They are not submitted to older peers.
Other package mutation, publishing, setup, management, and administrative commands
remain native rather than being forwarded as execution requests. Daemon management
subcommands use their separate control path. Rushx script names are not interpreted
as Rush built-ins. Arguments after `--` are preserved.
Request cwd, environment, argv, width and color are captured before connecting.
The protocol currently expresses request color as a boolean; subscriptions carry
the corresponding color level. There is no SIGWINCH forwarding.

The standalone host now binds native `build`/`rebuild` requests to a reusable
all-project graph. Native Rush parsing, project selection, graph plugins, and
incremental/cache semantics are reused rather than spawning another Rush CLI.
The client renders operation headers, collated text, and activity events; global
command byte streams remain byte-preserving. A `rushx build` script never claims
to be a workspace build.

Rushx requests carry `invocationKind: "rushx"` (protocol 0.8), independently of custom
command origin. Native parsing recognizes `-q`, `-d`, and `--ignore-hooks` before the
command; subsequent flags and `--` belong to the script, apart from this client's
explicit admission/escape controls. Older peers fall back before receiving the request
or consuming input.

The default daemon installs `RushDaemonRequestResolver(existingRushResolver)` to enable real
package-script execution alongside native workspace builds. It reuses native Rushx parsing, escaping,
banner/diagnostics, lifecycle PATH and INIT_CWD preparation, dotenv precedence, and
pnpm injected-dependency synchronization. Only the actual script shell is spawned;
there is no Rush CLI child or synthetic warm graph. Native configuration discovery
is captured by the client and emitted only with daemon output, avoiding duplicate
discovery messages on fallback.

On Windows, Rushx retains native invocation-path spelling in script cwd, lifecycle variables and
pnpm-sync output, including 8.3 aliases and junctions. Daemon identity and confinement remain physical;
an alias does not create another workspace identity or permit execution outside the workspace.
Alias retargeting while queued fails before execution. Relative `RUSH_TEMP_FOLDER` initialization
uses safe in-process fallback.

The composite is exported for embedded hosts and wired into the standalone daemon.
No default or cutover flag is flipped. Active Rushx hooks, encrypted dotenv
vaults, changed process-global Rush configuration variables, stale workspace configuration,
and native help require pre-execution fallback. Ignored/recursive hooks retain native
behavior, including skipping post hooks after failure. PTY requirements remain in-process.

Compatible requests reuse the same native graph. Source changes refresh inputs;
changed configuration or command shape replaces the session and graph in the same
process. Environment, installed dependencies, implementation content, or selected
Rush version changes require a process restart rather than patching the existing
engine. Direct, inherited, and rig-based project configuration uses private native
loaders and is rechecked before execution. External plugins, `.env`, phased
watch/install options, and unsupported event-hook scripts still use typed
pre-execution fallback; this does not exclude the built-in `install` and `update`
commands described above. The native Rush lock is held for preparation and each
coalesced iteration, not while idle; native commands and `--no-daemon` can run
after a completed request without stopping the daemon.

Native workspace dispatch copies the request envelope and normalizes only the
engine-owned `_RUSH_LIB_PATH` to this daemon's real engine. Foreign client SDK
paths therefore neither select the wrong SDK nor cause a false restart. All other
environment inputs remain unchanged and participate in normal lifecycle checks.

Protocol 0.10 permits a bounded retry only when a pre-execution command result
explicitly carries `retryAfterRestart: true`. `executeWithDaemonRestartAsync`
waits for old ownership release and a validated successor, then resubmits an eligible
request **at most once**. Command input/output or cancellation prevents retry,
even with the typed flag. Unknown rejections and connection loss never authorize replay.
A started `install` or `update` is never repeated, including after a nonzero exit;
only an unstarted request can receive
the typed retry authorization. Accepted queued requests drain their typed restart
results before the old connection closes.

Piped input uses protocol 0.7's negotiated stdin admission and EOF. The client does
not read input until the command attaches an input destination, and sends bounded
chunks only as the daemon grants write credits. EOF follows all preceding writes;
binary Ctrl+C bytes in a pipe are data, not cancellation signals. Older peers fall
back before `requestStart` or input consumption, and pre-execution command fallback
preserves the complete pipe for the native entrypoint.
The existing Rush entrypoints resolve project scripts from cwd. Fallback loads the
existing `@microsoft/rush` version-selecting entrypoint in the client process,
preserving its startup checks, output and reporter integration instead of
inventing a cached module path. Before auto-start or explicit start/restart, the client
selects an available daemon whose installed engine is exactly the requested Rush
version, including a native `RUSH_PREVIEW_VERSION` override. It can install a published
daemon release declaring that exact engine dependency into a node-specific Rush cache;
it never overrides dependencies or relabels the bundled engine. Foreign installations
are probed in isolation, and startup rechecks actual runtime version, protocol, and
default request-launch APIs before binding. Incompatible or unavailable launchers use
native fallback for ordinary invocations and fail explicitly for management commands.
Connect-only calls never install packages. Older Rush versions may also reject the new `daemon` config block; use
environment-only opt-in until a supporting Rush release is selected.

## Configuration

Every setting uses **environment > config > default**. Boolean overrides accept
only `0`/`1`; numeric overrides accept finite unsigned decimal numbers. Unknown
keys and unknown `RUSH_DAEMON*` variables fail validation.

| `daemon` key | Environment override | Default | Runtime status |
| --- | --- | --- | --- |
| `enabled` | `RUSH_DAEMON` | false | Client routing |
| `autoStart` | `RUSH_DAEMON_AUTO_START` | true | Only after opt-in |
| `idleTimeoutSeconds` | `RUSH_DAEMON_IDLE_TIMEOUT_SECONDS` | 900 | Host idle shutdown after request/output/cleanup drain |
| `queueTimeoutSeconds` | `RUSH_DAEMON_QUEUE_TIMEOUT_SECONDS` | 30 | Sent through existing admission contract |
| `watch` | `RUSH_DAEMON_WATCH` | false | Persistent host observation of requested warm projects; false keeps root/config guards only. Never schedules builds |
| `warmIdleTimeoutSeconds` | `RUSH_DAEMON_WARM_IDLE_TIMEOUT_SECONDS` | 300 | Idle runner, project-watcher and retained-result eviction |
| `warmMemoryBudgetMB` | `RUSH_DAEMON_WARM_MEMORY_BUDGET_MB` | 512 | Best-effort sampled RSS budget in MiB, not a hard ceiling |
| `warmSetMaxProjects` | `RUSH_DAEMON_WARM_SET_MAX_PROJECTS` | 20 | Best-effort retained-project limit; never trims requested execution |
| `autoWarmByTelemetry` | `RUSH_DAEMON_AUTO_WARM_BY_TELEMETRY` | false | Measured retention ranking with conservative LRU fallback; no speculative scripts |

Timeouts must be positive and at most 2147483.647 seconds; queue timeout additionally
accepts zero and is rounded down to milliseconds. Memory budget must be positive
and no larger than JavaScript's maximum safe integer. Project count must be a
positive safe integer. The session automatically owns these warm policies for its real
graph and watchers. Executing/prepared work and protected resources are not evicted.
Missing child-memory measurements stay explicitly unknown; unavoidable active/base
memory pressure is reported rather than hidden. No warm-set setting changes build correctness.
Project observation previously ran regardless of `watch`. Its existing default `false`
now disables host project observation; set it to `true` to retain observation between
requests. Every explicit native request still refreshes inputs and effective configuration.
Changing this flag neither discards warm results/runners nor starts scripts; safe idle
maintenance applies watcher changes and reports deferred or failed cleanup.

## Management

`rush-client daemon start` explicitly requests startup, independently of
`daemon.enabled`, `autoStart`, or CI execution routing. It conflicts with
`--no-daemon`. It is idempotent: an existing compatible daemon is reused, not
reconfigured. Startup uses the same detached, locked launcher as automatic
startup and selects an attested launcher rather than guessing a path for another Rush version.
With an explicit matching launcher, a daemon implementation-version mismatch triggers
ownership-checked replacement under the start mutex before executing any command.
It does not replace a peer lacking safe shutdown support. Foreign package installation
is a client preparation step; host self-restart selects only bundled or already cached
compatible installations, never installing while the old workspace is being cleaned up.

`rush-client daemon status` only connects and checks hello/pong. It never starts
a process, reclaims files, or treats a PID file as evidence of readiness. Both
commands print one JSON object with `state: "ready"`, `socketPath`, and the actual
pong fields (`uptimeMs`, available versions, optional `pid` and
`residentMemoryBytes`, and an optional `workspace` snapshot). Exit code 0 means protocol
readiness, not build support. An unreachable/incompatible endpoint, invalid
arguments, or startup failure returns exit code 1 with a diagnostic.

The optional workspace snapshot reports the provider generation/token, graph existence,
and available warm accounting without initializing a graph. Missing fields are unknown,
not proof of zero memory or successful reload. Status can inspect a protocol-compatible
daemon with a different implementation version; start requires the bundled version to match.

| `workspace` field | Meaning |
| --- | --- |
| `generation`, `generationToken` | Current provider generation and installed session identity |
| `lastReloadTier` | Lifecycle-owned `0` initial/reuse, `1` successful in-process reload, or `2` requested restart; older peers may omit it |
| `graphInitialized` | A graph exists; this does not attest build success |
| `warmSet.configuration` | Effective `watch` and four warm-resource settings; older peers may omit `watch` |
| `warmSet.maintenanceState`, `warmSet.maintenanceFailure` | Running, quiescing, stopped or failed maintenance; stopping it does not itself free resources |
| `warmSet.retainedProjectNames`, `warmSet.protectedProjectNames`, `warmSet.watchedProjectNames` | Actual retained/protected projects and resident project observation |
| `warmSet.daemonResidentMemoryBytes`, `warmSet.measuredRunnerMemoryBytes`, `warmSet.unmeasuredRunnerCount` | Daemon RSS, last-completion child RSS samples, and explicitly unmeasured resident runners; descendants are not included |
| `warmSet.overMemoryBudget`, `warmSet.overProjectLimit`, `warmSet.cleanupFailures`, `warmSet.deferredReason` | Outstanding footprint pressure, cleanup failures and maintenance deferral |

An absent `warmSet` means no controller is attached, not that the workspace consumes
no memory. Status reads `lastReloadTier` from the lifecycle (zero for a host without one);
it does not infer a tier from PID/generation changes or initiate a reload. Tier `2`
attests a restart request, not completion of successor startup or success of a command.

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
An operation without an observed execution status reports `null`. An idle operation
whose actual completed result was evicted reports `READY` for request-time revalidation,
not historical success; inspection does not schedule work. Snapshots contain no
environment, runner, log, or terminal objects.

Protocol 0.9 snapshots include an opaque `workspaceGeneration` token. Every mutation
echoes a token, checked under exclusive admission before touching the graph. The
token changes on soft reload and process replacement, preventing stale operation
references from affecting a new generation. Use `--generation TOKEN` with a token
from an earlier snapshot to preserve that reference; the client never refreshes an
explicit token. Without this option, the client privately reads current status
before submitting the mutation. A reload between those requests fails closed.
Mutations reject older peers before submission; read-only inspection remains compatible.

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
