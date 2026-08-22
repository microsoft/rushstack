# @rushstack/rush-daemon

The long-lived Rush workspace daemon host, including workspace-keyed listener bootstrap,
protocol handshake and liveness control, a warm `WorkspaceSession`, and explicit
serve/shutdown lifecycle APIs.

The package provides an opt-in `rushd` executable. Run it from a Rush workspace to start the host
for the nearest `rush.json`; it does not change the default behavior of `rush`, `rushx`, or
`rush-pnpm`.

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
The default daemon executable does not construct or route this graph while the command-independent plugin shape and per-iteration runner
lifetime tracked by [rushstack#5895](https://github.com/microsoft/rushstack/issues/5895) remain incomplete.

`PhasedRequestRouter` is the opt-in execution boundary once an integration has supplied that real warm graph. The
integration parses the command and supplies an explicit phase/plugin shape plus operation enabled-state selection;
the router validates both, reconciles retained invalidations, applies the selection with `IOperationGraph.setEnabledStates`,
and runs at most one scheduled iteration. Requests are serialized until shared-build merging is implemented. A
requesting client receives only its enabled dependency closure's WS1 raw chunks and structured events through
backpressured, ordered callbacks, followed by client-scoped operation results. Cancellation or disconnect aborts the
current iteration without closing daemon-owned runners or the graph.

This layer deliberately does not add control-frame admission or reconstruct `PhasedScriptAction` command/plugin
initialization. The typed phased request contract begins after an integration has produced a validated selection for
the exact warm engine shape; full command parsing remains blocked by
[rushstack#5895](https://github.com/microsoft/rushstack/issues/5895).

`GlobalCommandRequestRouter` is the corresponding opt-in boundary for caller-resolved global command logic. It
canonicalizes and confines the request working directory to the workspace, snapshots its environment, creates a
request-scoped terminal with explicit columns/color/TTY properties, and tracks child processes and async resources
through cancellation or disconnect. Concurrent requests never change `process.cwd()`, `process.env`, or daemon
stdin/stdout/stderr; child commands receive cwd, environment, cancellation, and output routing through the injected
execution context.
Executors must cooperatively observe the context abort signal and settle before cancellation completes, ensuring no
caller-owned logic can outlive its request resources.

The existing `RushCommandLineParser`, `BaseRushAction`, and some built-in/global action helpers still consult or mutate
process-global state. This layer therefore does not pretend that arbitrary existing actions are daemon-safe: the
integration must supply already resolved command logic that consumes `IGlobalCommandExecutionContext`, including
`spawnChild()` for command-local subprocesses. Adapting the complete action surface remains bounded by the open
[rushstack#5895](https://github.com/microsoft/rushstack/issues/5895) engine/action prerequisite work. Exit-code policy,
interactive stdin/raw-mode/PTY support, scheduling classification, and shared-build merging belong to later layers.
