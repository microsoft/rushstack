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
The default daemon executable composes `ProductionDaemonRequestResolver` with native Rushx handling via
`RushDaemonRequestResolver`. Its first supported workspace build binds a real all-project graph lazily,
without replacing the session watcher or discarding retained invalidations. Rushx scripts do not construct
a workspace graph. Embedded hosts can install the composite explicitly; omitting a resolver from
`RushDaemonHost` retains the unsupported build behavior.

### Bounded native engine integration

`PhasedCommandEngine` in `rush-lib` parses native `build` and `rebuild` commands without invoking CLI execution,
initializing `.env`, changing the process working directory, or mutating `process.env`. Graph preparation reuses
`PhasedScriptAction`'s standard operation, sharding, shell-runner, validation, cache/legacy-skip, and situational
plugin pipeline. It does not launch a Rush CLI subprocess. The graph includes every project, and native
`SelectionParameterSet` results are applied at request time. In particular, `--only` and the impacted-project
selectors do not accidentally enable omitted dependencies; `--include-phase-deps` explicitly expands them.

The host uses stable fingerprints to classify native requests:

| Tier | Inputs | Action |
| --- | --- | --- |
| 0 | Unchanged definitions/parameters, or ordinary project source changes | Retain session, graph, plugins, and completed records; reconcile operation inputs |
| 1 | Rush/project configuration, effective rig/inherited settings, command shape, or unhealthy invalidation tracking | Drain the old generation, dispose it, and construct a new session and real graph in the same process |
| 2 | Environment, installed dependency state, implementation content, or selected Rush version | Drain request results (typed retry only for unstarted work), release old ownership, and launch a genuinely available matching successor; an eligible client may retry once |

Configuration fingerprints use contents rather than timestamps. Runtime content hashes are cached only behind
file identity/size/mtime/ctime checks; touching unchanged content does not itself change a fingerprint.
Compatible selections reuse the same graph and records. An unchanged successful build schedules no work; rebuild
still invalidates the graph on each request. Every execution refreshes operation inputs under its native lease.

A generation lease spans resolution through final output. Reload also takes exclusive workspace admission and
the native preparation lock, discards paused prepared work, and awaits old runner/plugin/watcher cleanup before
publishing the replacement. The initiating request atomically downgrades its admission so another reload cannot
dispose the newly selected graph before it runs. Watch requests are cancelled and drained before their generation
is replaced. Server-side re-resolution is limited to races detected before scheduling and before attempting a
terminal result. Protocol 0.10's separate client retry requires an explicit pre-execution
`retryAfterRestart: true` result and the safeguards described below; it never replays started work.

This integration supports Git-backed workspaces with direct, inherited, or rig-based project configuration and ordinary native phases.
Engine configuration snapshots use private native configuration-file loaders and non-caching rig resolution, including
the normal native inheritance merge and schema validation. Git selectors likewise read request-owned ignore-glob
configuration. The engine does not clear, read, or populate the process-wide project/rig configuration caches.
Before each iteration, it reloads effective project configuration under the native execution lease and compares
the graph/cache settings with the construction snapshot. Changed inherited or rig-provided settings trigger a
generation reload before execution, even outside watcher roots or in ignored `node_modules` files.
The retained graph and its cache policy are never patched in place.

External Rush plugins, `.env` initialization, watch/install/variant
and diagnostic-directory options, build event-hook scripts (unless explicitly ignored), and arbitrary global
commands are rejected by the phased path, not silently bypassed. Native Rushx is handled separately below.
For phased commands, a changed request environment requires a new process, including Rush/cache
policy variables. These restrictions remain until the corresponding initialization,
environment, and resource-lifetime contracts are request-scoped.

The native Rush lock is held only during graph preparation and each coalesced iteration, not while the warm daemon
is idle. `acquireExecutionLeaseAsync` is an optional engine/session hook invoked once by the batch coordinator,
before input reconciliation. Compatible clients share that lease rather than contending independently. It remains
held through operation execution, runner cleanup, and every participant's output/input cleanup; the batch barrier
releases it before any final command result is published. Thus ordinary native actions and permanent `--no-daemon`
fallback can run immediately after a completed warm request without stopping the daemon.

A real native command holding the lock causes preparation or execution to be refused; there is no lock bypass or
automatic retry. A later explicit request can retry after contention ends, including contention during the first
engine initialization. A dirty native lock left by another command invalidates retained successes so the native
incremental/cache pipeline can reconcile possibly changed ignored outputs. Installation validity is also checked on
every snapshot refresh. Disposal stops new leases, awaits an outstanding lease, then aborts the graph lifetime and awaits
runner/provider cleanup. The existing operation-completion cleanup is unchanged.

### Process restart and isolated install/update

`serveRushDaemonAsync` supplies a successor selector for the currently installed daemon/Rush version.
Embedded `RushDaemonHost` users can provide `getSuccessorLaunchAsync`, returning the existing core
`IDaemonStartCommand` plus the expected daemon implementation version. Selection is validated before shutdown;
an unavailable selected Rush version fails explicitly and is never run by the current engine under a false version.
The default entrypoint supports the `rush.json` version, not a separate preview-version namespace.

Successor startup reuses `connectOrStartDaemonAsync`: acknowledged old ownership must be released after all old
resources finish, startup is serialized with ordinary clients, and hello/ping readiness attests a different PID.
`restartCompleted` reports completion or failure. These warm/retry features do not establish availability of
another selected Rush version; a matching launcher must actually be resolved, otherwise the transition fails closed.

Protocol 0.10 (`DAEMON_WORKSPACE_RESTART_PROTOCOL_MINOR`) provides bounded, typed retry authorization.
Only a pre-execution command result may carry `retryAfterRestart: true`. During a planned restart, accepted
queued requests drain those typed results before disconnect rather than being reduced to ambiguous connection
loss. The client's `executeWithDaemonRestartAsync` waits for old ownership release and a validated successor,
then retries an eligible request **at most once**. Command input/output or cancellation prevents retry,
even with the typed flag. Error text, a changed PID, or connection loss never authorizes replay.
Ordinary shutdown and disconnect retain cancellation semantics.

Positively identified built-in `install` and `update` requests execute in `NativeMutationWorker`, a single-shot
native Rush parser process owned by `GlobalCommandExecutionContext`. This is not the phased warm engine.
Native arguments, policies, hooks, stdin/EOF, output and numeric exit status are preserved. Even a failed mutation
may have changed files: its exact result is drained before old generation cleanup and successor startup.
Post-mutation state selects the successor. If the result cannot be drained or the selected version cannot be
launched, the host stops without silently starting an incorrect successor. A mutation that started is never
replayed, even after failure; an unstarted request can retry only through the typed pre-execution contract above.

The opt-in CLI forwards positively identified built-in `install` and `update` only to peers supporting protocol
0.10. Other administrative commands remain native; Rushx script names are not reinterpreted as Rush built-ins.
Client-originated graph-reference fencing uses the protocol's generation token; operation names alone cannot
identify which snapshot a client previously observed. Graph controls do not migrate a prepared iteration across
a generation replacement.

Resolver composition uses the optional `IDaemonRequestResolver.workspaceLifecycle` capability, not an
`instanceof` check. A composite delegates native inspection but must wrap every generation replacement too:

```ts
this.workspaceLifecycle = wrapWorkspaceResolverLifecycle(
  phasedResolver,
  (replacement) => new RushDaemonRequestResolver(replacement)
);
```

The helper returns `undefined` for a delegate without lifecycle support. Explicit `invocationKind: "rushx"`
requests retain a generation lease but go directly to the composite resolver, without native build/mutation/graph
interception or phased environment matching. They use exclusive global admission. The host disposes each old
resolver before replacing its session, and disposes the current resolver at shutdown; the composite must forward
its normal disposer to its owned delegates.

**Client integration boundary:** the resolver requires `commandOrigin: "built-in"` for native
`build`/`rebuild`. The standalone client identifies these workspace commands while leaving
`rushx build` and other script invocations custom. The resolver also validates the native parsed
action; identical script names alone never authorize a workspace build.

### Warm-set generation attachment (WS3)

`WorkspaceSession` automatically owns the warm controller for each real graph and
`WorkspaceSessionFileWatcher`, using the effective `rush.json`/environment settings. Both lazy native
initialization and eagerly supplied components attach after watcher startup and before the first iteration.
An integration-supplied controller is adopted, not duplicated. Custom watchers or graphs without native
result-eviction support remain explicitly unaccounted rather than reporting a fictitious warm set.

Embedded integrations can still use `WorkspaceWarmSet.attach(options)` directly with a **real, already-created**
graph and an **already-started** watcher. Capture that generation's native execution lease callback and use
the same workspace scheduler that admits phased/global requests and graph mutations:

```ts
const acquireExecutionLeaseAsync = engine.acquireExecutionLeaseAsync;
if (!acquireExecutionLeaseAsync) throw new Error('The native engine must provide execution ownership.');
const warmSet = WorkspaceWarmSet.attach({
  operationGraph: engine.operationGraph,
  configuration: resolvedDaemonConfiguration,
  scheduler: getWorkspaceRequestScheduler(session),
  acquireExecutionLeaseAsync,
  watcher: generationWatcher,
  onDiagnostic: reportWarmDiagnostic
});
```

`getWorkspaceRequestScheduler` is the existing package-internal helper in `WorkspaceRequestAdmission.ts`.
The configuration is the existing resolved `rush.json`/environment configuration; `updateConfiguration()` also
validates and applies policy changes at runtime. Dispose the controller **before** its generation's engine and
watcher, outside outstanding request leases. Controller disposal stops its timer and awaits maintenance;
it does not dispose resources owned by the generation. The default session performs this ownership sequence
automatically, including for component-owned instances of the concrete file watcher.

`quiesceWarmSetAsync()` is a one-way generation barrier: it stops the current controller, waits for pending
initialization, and disposes any controller returned late before completing. Quiescing a cold session prevents
later initialization from installing an active controller behind that barrier. Existing initialized graphs may
still finish admitted work; generation reload owns their disposal. Reload quiesces **before** taking workspace
and native preparation locks, so those locks cannot deadlock an in-flight maintenance lease. Late cleanup and
native lease-release failures remain sticky and block replacement; an optional project eviction failure still
preserves its records and diagnostics without failing an otherwise successful build.

| Policy | Runtime behavior |
| --- | --- |
| `watch` | Retains host observation of requested warm projects between requests when true. False (the default) keeps root/config guards only. Never schedules builds. |
| `warmIdleTimeoutSeconds` | Expires unused project runners, watchers and retained results after requests finish. Unchanged requests refresh recency too. |
| `warmSetMaxProjects` | Retains the highest-ranked idle projects within the limit; executing/prepared and explicitly protected work is exempt. |
| `warmMemoryBudgetMB` | Attempts idle eviction under sampled daemon-plus-measured-child RSS pressure. Never treats cache files as memory or claims a hard RSS ceiling. |
| `autoWarmByTelemetry` | Promotes already-requested high-value work instead of pure LRU. Never schedules or executes speculative scripts. |

One deterministic best-first comparator is shared by retention and reverse-order eviction. With complete
measurements it uses `(timeSavedMs * requestFrequency) / residentMemoryBytes`, then recency, then ordinal project
name. Measured entries precede the missing-data bucket; that bucket uses LRU and the same name tie-break.
Without telemetry mode the entire order is LRU. Savings compare actual cold and reused execution stopwatches
(or native non-cached duration versus cache-restoration duration); no startup cost or RSS is invented.
`operation-graph`'s existing `WatchLoop` now reports its own measured RSS in an optional IPC completion field.
The native IPC runner accepts that sample and exposes it only while resident. Old children and unsupported
runners remain explicitly unmeasured. These are last-completion process samples, not live measurements of
descendants. Shell-runner records/watchers live within daemon RSS and have no fabricated per-project allocation.

Maintenance acquires **exclusive, no-wait workspace admission**, then native repository ownership. It defers on
contention or an executing/prepared graph without cancelling, discarding or mutating that work. Optional
`getProtectedOperations()` protects additional generation-owned resources; update that protection under the
same scheduler. Maintenance awaits `closeRunnersAsync`, confirms that runners no longer report active resources,
awaits project watcher closure, and only then calls guarded native `deleteResults()`. Its `beforeDeleteResults`
hook releases native cache/skip plugin scratch state; deletion also detaches old iteration contexts/record edges
while preserving survivors' hashes, timing, warnings and status. Graph
definitions, enabled selections and disk caches are unchanged. The native per-iteration `shouldRunnerPersist`
policy is deliberately left intact: optional footprint cleanup must not turn successful requested work into a
failed build merely because an optimization could not release resources.

The default session starts with permanent root and Rush/subspace configuration observation and
`projectNames: []`, not recursive watchers for every cold project. With `watch: true`, requested projects are
observed during planning and between requests; idle eviction removes their observation. With `watch: false`,
host project observation is disabled, but retained runners and execution results are not discarded merely
because observation is off. **Every native request must still refresh its
input snapshot and revalidate effective direct/rig/inherited configuration**, including files outside watcher
roots. Cold source changes therefore rebuild correctly; changed graph configuration fails closed until the
generation owner supplies a freshly constructed engine. A same-PID soft reload replaces the controller,
watcher, graph and session together; controller history never migrates across generations.

Changing observation policy uses the same idle maintenance leases. Enabling it restores observation of eligible
retained projects without running scripts; disabling it awaits project watcher closure without closing runners
or deleting results. Executing/prepared graphs and protected projects defer teardown, and failed/pending closes
remain visible in status and diagnostics. This flag controls only the host's project file observation, not
watchers inside retained runner processes, native Rush watch mode, or an autonomous build loop.
Previously project observation ran regardless of the inactive flag. Honoring its existing default `false`
intentionally lowers background observation; set `watch: true` to retain that observation between requests.

`getStatus()` reports actual retained/protected projects, daemon RSS, measured child RSS, unmeasured runners,
remaining pressure, maintenance deferral and failed cleanup. Diagnostics go to `onDiagnostic` (or a process
warning). Failed cleanup keeps records and truthful resource accounting, and cannot falsify a command result.
Releasing records does not force V8/allocator RSS to shrink. If remaining daemon memory, active/protected work,
or cleanup failures cannot fit the budget, pressure remains reported instead of claiming success.

### Read-only generation and warm status

Daemon `pong` replies (and the existing JSON `daemon status` output) include an optional `workspace` snapshot.
`RushDaemonHost.workspaceStatus` exposes the same synchronous view. It reads the provider's installed session
and opaque generation token without calling `getSessionAsync()`, preparing a graph, scheduling work, or waiting
for lifecycle/workspace/native locks. During old-generation cleanup it reports that installed generation;
while a replacement session is being constructed the token is absent. The token matches graph fencing tokens.

| Field | Meaning |
| --- | --- |
| `generation`, `generationToken` | Provider generation counter and current installed session identity; neither implies a graph or successful build. |
| `graphInitialized` | Whether that session has a materialized operation graph. |
| `warmSet` | Absent when no controller is attached, not a claim of zero memory. |
| `warmSet.configuration` | The effective `watch` flag and four warm-resource knobs; older peers may omit `watch`. |
| `maintenanceState`, `maintenanceFailure` | Running, quiescing, stopped, or failed maintenance; stopping maintenance alone does not free graph/watcher resources. |
| `retainedProjectNames`, `protectedProjectNames`, `watchedProjectNames` | Actual retained projects, additional protection and still-resident project observation, including pending close. |
| RSS, unmeasured count and pressure fields | Sampled daemon/child memory and outstanding limits, with unknown child memory explicitly distinguished from zero. |
| `cleanupFailures`, `deferredReason` | Failed optional cleanup and why maintenance could not run. |

All rows after `warmSet` describe fields inside that object. The extra pong field is additive and optional;
old pong messages still decode. The protocol validates nested shapes, finite counts/budgets and generation
identity. This optional status field is independent of protocol 0.10's typed restart-retry contract.
Graph snapshots also stop reporting historical success after a retained result is evicted: idle cold operations
report `READY` for request-time revalidation, without scheduling work or modifying the completed build outcome.

### Native Rushx integration

`RushXDaemonRequestResolver` handles only `invocationKind: "rushx"` with custom origin.
`RushDaemonRequestResolver(existingRushResolver)` composes it with an injected workspace
resolver; omitted or `"rush"` kinds go to that existing resolver without reinterpreting
custom workspace commands. The default executable installs this composite for both native
workspace builds and package-script execution.

The resolver validates canonical request and governing package directories inside its
workspace before execution. Subfolder invocations run from the nearest package folder,
with native PATH, INIT_CWD, RUSH_INVOKED_FOLDER, npm environment filtering and shell escaping.
Per-request dotenv copies load repository then user values without changing daemon cwd,
environment, argv, console streams or cached user configuration. Ordinary script/environment
changes are read for each invocation; there is no cached script process or fabricated warm engine.

`RushXCommand` shares the native implementation with the unchanged in-process entrypoint.
Its asynchronous lifecycle spawn seam uses `spawnChild()` for the actual script shell.
The context owns descendants, backpressures raw stdout/stderr, forwards stdin credits/EOF,
and awaits cleanup before the final result. Early child stdin closure preserves the script's
exit status. Native console ANSI bytes are preserved separately from color-aware diagnostic
output; pnpm synchronization keeps native quiet/debug behavior. Cancellation retains the
existing typed global-request abort result rather than inventing a second exit policy.

Active pre/post Rushx hooks still depend on process-global argv and synchronous inherited
I/O and are rejected before execution/input. `--ignore-hooks` and recursive calls reuse
native skipping behavior. Encrypted dotenv vaults, unsupported environment initialization,
and changed Rush/experiments configuration also reject before execution; queued configuration
changes fail closed on admission. No hook, dependency synchronization, warning or terminal
requirement is silently omitted. Controlling-terminal requests use the existing in-process
policy; no PTY is allocated. Protocol 0.8 prevents older peers from interpreting
`rushx build` as a workspace build.

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
late-frame handling without unbounded growth. Disconnect and ordinary host shutdown abort connection-owned
requests before the resolver and warm workspace are disposed. Planned process restart instead lets accepted
queued requests drain eligible typed restart results before their connections close. Separate connections still
share the workspace scheduler and phased batch coordinator, so compatible selections can execute in one iteration.

The dispatcher accepts an integration-owned `IDaemonRequestResolver` that maps the validated envelope to the existing
typed phased request or isolated global executor contracts. Resolvers receive the request abort signal and must settle
when cancellation, disconnect, or host shutdown aborts it. An embedded host without that resolver continues to start,
answer ping, and reject ordinary command execution with the typed `unsupported` outcome; it never constructs an empty graph
or reports a false success. A retained invalidation that throws `WorkspaceEngineRecreationRequiredError` is
reported as `workspaceRecreationRequired` before scheduling for unmanaged integrations. The production lifecycle
instead replaces the generation and re-resolves a phased request only while execution is proven not to have begun.

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
changes. Pause/resume set native manual mode; explicit builds may still run while
paused. Releasing prepared automatic work acquires the same native execution lease
as normal batches, discards its unstarted records, reconciles current inputs, and
reprepares the existing selection. It retains both leases until native idle, even
after request cancellation. A cold or unscheduled graph is never initialized or
given new work by resume.

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
