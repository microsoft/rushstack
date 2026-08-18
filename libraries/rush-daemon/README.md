# @rushstack/rush-daemon

The long-lived Rush workspace daemon host, including workspace-keyed listener bootstrap,
protocol handshake and liveness control, a warm `WorkspaceSession`, and explicit
serve/shutdown lifecycle APIs.

The package provides an opt-in `rushd` executable. Run it from a Rush workspace to start the host
for the nearest `rush.json`; it does not change the default behavior of `rush`, `rushx`, or
`rush-pnpm`.

The host loads `RushConfiguration` once before signaling readiness and keeps a headless file watcher
active for the daemon lifetime. Its invalidation tracker retains changes while no clients are
connected so a later request can reconcile them. Reusable operation graph, plugin, and input snapshot
state can be supplied through the session component factory; the default session does not construct
those command-specific resources while the reusable runner lifetime tracked by
[rushstack#5895](https://github.com/microsoft/rushstack/issues/5895) remains incomplete.
