# @rushstack/rush-daemon

The long-lived Rush workspace daemon host, including workspace-keyed listener bootstrap,
protocol handshake and liveness control, a warm `WorkspaceSession`, and explicit
serve/shutdown lifecycle APIs.

The package provides an opt-in `rushd` executable. Run it from a Rush workspace to start the host
for the nearest `rush.json`; it does not change the default behavior of `rush`, `rushx`, or
`rush-pnpm`.

Embedded hosts can opt into automatic shutdown with `idleTimeoutSeconds`. The timeout starts after
readiness and resets after the last pending request finishes, including resolution, queueing, execution,
output drain, and cleanup. An idle connection does not keep the daemon alive. Omitting the option keeps
the existing unlimited lifetime; invalid, nonpositive, or overflowing timeouts are rejected before startup.
The host's `closed` promise signals completion of shutdown, including idle shutdown, and `closeAsync()`
reports cleanup failures. `serveRushDaemonAsync()` returns after either idle shutdown or its shutdown signal.

Protocol 0.6 management clients can stop the host through the workspace transport rather than signaling a PID
read from disk. The host requires a lifecycle-capable hello, drains `shutdownAck` before beginning shutdown,
then cancels outstanding requests and disposes the resolver, workspace, and endpoint through its normal close
path. A connection closing is not by itself proof that endpoint cleanup has finished: restarting clients must
wait for transport ownership to be released before starting a successor. Ownership is retained until resolver
and workspace disposal both succeed; cleanup failures retain the live owner's lock and are reported rather
than allowing a successor to overlap still-resident engine state. Ping responses include the live PID
and resident memory; they do not claim that the loaded projects have a warm operation graph.

The host loads `RushConfiguration` once before signaling readiness and keeps a headless file watcher
active for the daemon lifetime. Its invalidation tracker retains changes while no clients are
connected so a later request can reconcile them. The tracker starts with a conservative unknown
invalidation covering session startup, and excessive distinct paths are compacted into the same
full-workspace signal.

`WorkspaceEngineComponentFactory` provides the opt-in seam for a command integration to supply a real
all-project operation graph, its `RushSession`, and a refreshable inputs snapshot. The integration must
declare the complete phase and plugin shape because Rush plugins can currently vary that shape by command.
The factory validates graph ownership, serializes retained invalidation reconciliation, and maps path-specific
changes through the integration. The engine owner must supply one deterministic async disposer because
`IOperationGraph` does not yet expose an operation that both stops the lifetime and awaits runner cleanup.
After the initial conservative startup reconciliation, changes to Rush configuration, project package manifests,
or integration-classified plugin graph inputs fail closed with `WorkspaceEngineRecreationRequiredError` before
the input baseline advances or the invalidation is acknowledged. The startup watcher-registration boundary has
no paths to classify and therefore remains a full invalidation. The routing layer must replace the complete
workspace session rather than run a stale graph.
The default daemon executable installs `ProductionDaemonRequestResolver`. Its first supported request binds a real
all-project graph lazily, without replacing the session watcher or discarding retained invalidations. Embedded hosts
can install the same resolver explicitly; omitting a resolver from `RushDaemonHost` retains the unsupported build behavior.

### Bounded native engine integration

`PhasedCommandEngine` in `rush-lib` parses native `build` and `rebuild` commands without invoking CLI execution,
initializing `.env`, changing the process working directory, or mutating `process.env`. Graph preparation reuses
`PhasedScriptAction`'s standard operation, sharding, shell-runner, validation, cache/legacy-skip, and situational
plugin pipeline. It does not launch a Rush CLI subprocess. The graph includes every project, and native
`SelectionParameterSet` results are applied at request time. In particular, `--only` and the impacted-project
selectors do not accidentally enable omitted dependencies; `--include-phase-deps` explicitly expands them.

The first command and its non-selection parameters pin the engine identity. Compatible selections reuse the same
graph and completed records; an unchanged successful build schedules no work. Rebuild deliberately invalidates
the graph on each request. Input snapshots refresh at every request, even if watcher callbacks have not arrived,
and native operation hashes decide which inputs changed. Graph-defining changes reject execution before advancing
the baseline. Command/parameter/environment changes are rejected rather than reusing stale runner definitions or
automatically retrying a possibly executed request.

This first integration supports Git-backed workspaces with direct project configuration and ordinary native phases.
External Rush plugins, inherited or rig-based project configuration, `.env` initialization, watch/install/variant
and diagnostic-directory options, build event-hook scripts (unless explicitly ignored), and arbitrary global/rushx
commands are rejected, not silently bypassed. The complete request environment must match the daemon startup
environment, including Rush/cache policy variables. These restrictions remain until the corresponding initialization,
environment, and resource-lifetime contracts are request-scoped.

The native Rush lock is held from graph construction until successful disposal. Stop the daemon before using
native mutation commands or switching to `--no-daemon`; restarting is required for another command shape, parameters,
environment, or graph configuration. Disposal aborts the graph lifetime, awaits the current iteration and runner
cleanup, disposes the owned cobuild provider, and only then releases the native lock. A cleanup failure retains it.
The existing operation-completion cleanup is unchanged.

**Client integration boundary:** the resolver currently requires `commandOrigin: "built-in"` for native
`build`/`rebuild`. A `rushx build` envelope must never be mistaken for a workspace build. The WS4 client at this
baseline labels all commands `"custom"` and therefore still receives `unsupported` until its Rush-versus-rushx
discrimination is wired. This adapter intentionally does not guess from identical `argv` or weaken that boundary.

`PhasedRequestRouter` is the opt-in execution boundary once an integration has supplied that real warm graph. The
integration parses the command and supplies its built-in/custom origin, an explicit phase/plugin shape, and operation enabled-state selection;
the router validates both, reconciles retained invalidations, applies the selection with `IOperationGraph.setEnabledStates`,
and runs at most one scheduled iteration. A workspace-wide `RequestScheduler` admits phased and global routes using
the static built-in command policy (`SHARED-BUILD`, `SHARED-READ`, or `EXCLUSIVE`); custom-origin commands and unknown
built-in names fail closed to `EXCLUSIVE`, including plugin replacements of built-in names. Queued clients receive
ordered, one-based position controls and can request fail-fast or bounded waiting. One absolute deadline and progress
channel cover both workspace admission and the temporary phased graph-execution gate. Cancellation, disconnect, or
queue-output failure removes queued work before it can execute.
A requesting client receives only its enabled dependency closure's WS1 raw chunks and structured events through
backpressured, ordered callbacks, followed exactly once by a typed final command result after all preceding output
drains. The result translates only that client's operation subset to Rush's success, warning, failure, or abort exit
semantics. Warning-only builds honor the operation's configured `allowWarningsInSuccessfulBuild` state plus the
request's immutable `RUSH_ALLOW_WARNINGS_IN_SUCCESSFUL_BUILD` environment override without mutating `process.env`.
Compatible phased `SHARED-BUILD` requests admitted before the next graph iteration starts are coalesced at a
deterministic event-loop-turn boundary. The router reconciles retained invalidations once, unions the clients' enabled
dependency closures, and schedules one iteration. Shared operations execute once, while each client subscribes only
to its own closure and derives its final result only from that subset. Requests admitted after scheduling starts form
a later batch. Cancelling or disconnecting one client removes its subscription without aborting work needed by other
clients; the graph iteration is aborted only after every client in that batch has stopped needing it.

The typed phased router remains separate from native initialization. `ProductionDaemonRequestResolver` supplies
validated exact selections from `PhasedCommandEngine`; other integrations retain the existing dependency-closure
selection mode by default. Native empty project selections are successful no-op requests.

`GlobalCommandRequestRouter` is the corresponding opt-in boundary for caller-resolved global command logic. It
canonicalizes and confines the request working directory to the workspace, snapshots its environment, creates a
request-scoped terminal with explicit columns/color/TTY properties, and tracks child processes and async resources
through cancellation or disconnect. Concurrent requests never change `process.cwd()`, `process.env`, or daemon
stdin/stdout/stderr; child commands receive cwd, environment, cancellation, and output routing through the injected
execution context.
Executors must cooperatively observe the context abort signal and settle before cancellation completes, ensuring no
caller-owned logic can outlive its request resources. Executors return their command exit code; the router preserves
that code, translates thrown or cleanup failures to Rush's failure exit code, drains terminal output, and delivers one
final result.

`RushDaemonHost` now owns one `DaemonRequestDispatcher` for the complete warm workspace lifecycle and passes it
to every `DaemonControlSession`. After hello and capability subscription, each connection validates unique request
identifiers, accepts presentation-free request envelopes, routes request-tagged stdin and cancellation, and serializes
queue progress, raw-mode controls, binary output, structured events, and the terminal result through one backpressured
wire queue. A connection runs at most one request at a time so binary operation output remains unambiguous; concurrent
requests use separate connections. Each connection accepts at most 256 distinct request identifiers before the client
must reconnect, allowing the lifecycle and stdin routers to retain every identifier for deterministic duplicate and
late-frame handling without unbounded growth. Disconnect and host shutdown abort every connection-owned active or
queued request before the resolver and warm workspace are disposed. Separate connections still share the workspace
scheduler and phased batch coordinator, so compatible selections can execute in one iteration.

The dispatcher accepts an integration-owned `IDaemonRequestResolver` that maps the validated envelope to the existing
typed phased request or isolated global executor contracts. Resolvers receive the request abort signal and must settle
when cancellation, disconnect, or host shutdown aborts it. An embedded host without that resolver continues to start,
answer ping, and reject ordinary command execution with the typed `unsupported` outcome; it never constructs an empty graph
or reports a false success. A retained invalidation that throws `WorkspaceEngineRecreationRequiredError` is
reported as `workspaceRecreationRequired` before scheduling. Replacing the warm session is intentionally deferred to
WS3.

### Experimental graph requests

The dispatcher reserves built-in `daemon graph` argv before invoking the production
command resolver. Requests require `environment.RUSH_DAEMON_EXPERIMENTAL === "1"`
and noninteractive input; unknown verbs, malformed selector pairs, and non-built-in
origins are rejected. There is no graph construction or command execution fallback.
`show`/`status` can report an uninitialized session; other verbs require its real graph.

The route emits JSON-safe `rushd.graph-snapshot` extension events followed by the
existing request result. IDs, project/phase, enabled/status/dependencies, manual-mode
and scheduled flags, and a path-free invalidation summary are the entire snapshot.
It never sends environment variables, native runner objects, logs, or terminal output.
Scope selectors are exact operation IDs or project names and are fully validated
before applying native safe enablement or invalidation. Scope-out expands consumers
before native safe-disable prunes unneeded dependencies.

Mutations acquire exclusive admission from the same workspace request scheduler.
Active iterations cannot be mutated; prepared iterations reject scope/invalidation
changes. Pause/resume set native manual mode without scheduling anything. Explicit
builds may still run while paused. Releasing an already scheduled automatic iteration
via resume retains admission until native idle, even after request cancellation.
The engine owner remains responsible for scheduling work; this route never calls
graph execution or initialization APIs.

Watch is a lease-free observation subscription: one hook set per graph fans out
to live subscribers, each retaining a single dirty notification while its output
is backpressured. Status, invalidation and idle hooks wake the same bounded loop.
Workspace invalidation notifications also cover acknowledgements and watcher errors;
failed notification callbacks are warned without interrupting change tracking.
Cancellation, graph shutdown and disconnect unsubscribe promptly. A live watch
counts as an active request for daemon idle shutdown. No automatic build loop or
new wire version/capability handshake is introduced.

The existing `RushCommandLineParser`, `BaseRushAction`, and some built-in/global action helpers still consult or mutate
process-global state. This layer therefore does not pretend that arbitrary existing actions are daemon-safe: the
integration must supply already resolved command logic that consumes `IGlobalCommandExecutionContext`, including
`spawnChild()` for command-local subprocesses. Adapting the complete action surface remains bounded by the open
[rushstack#5895](https://github.com/microsoft/rushstack/issues/5895) engine/action prerequisite work. `InteractiveRequestInputRouter` supplies the opt-in WS2.7 boundary for connection-scoped input. The WS1 stdin
frame carries a request identifier plus untouched raw bytes; frames are serialized per request through an injected
sink while separate requests remain isolated. Global command integrations can bind that sink directly to a spawned
child process. Both global and phased routes stop accepting input on abort/disconnect and await input drain plus an
acknowledged cooked-mode restoration before publishing the exact-once command result. The daemon never reads or
mutates its own stdin or raw-mode state.

Protocol 0.7 clients may negotiate stdin admission and EOF. Attaching an input sink grants one
`stdinReady` write credit; another follows each completed write. `stdinEnd` is queued behind preceding
data, and later data or duplicate EOF is rejected. Cancellation remains serviceable while a sink is
backpressured or not yet attached. Input sinks that accept EOF implement `endInputAsync()`; missing
EOF support fails the request explicitly. `spawnChild(..., { forwardInput: true })` forwards both
bytes and EOF to the owned child process. Older clients receive no new controls.

Terminal width remains the immutable request-start value established by WS2.5. The thin client owns resize and
rendering, so this layer does not forward `SIGWINCH`. Commands declaring a real controlling-terminal requirement
receive a typed `requiresInProcess` policy result and are not executed by rushd; no pseudo-terminal is allocated or
emulated. The future WS4 client will perform the actual in-process fallback and parse `--no-wait` /
`--wait-timeout`.
