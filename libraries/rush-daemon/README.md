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
The default daemon executable does not construct or route this graph while the command-independent plugin shape and per-iteration runner
lifetime tracked by [rushstack#5895](https://github.com/microsoft/rushstack/issues/5895) remain incomplete.
