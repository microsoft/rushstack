# @rushstack/rush-buildxl-graph-plugin

Rush plugin for generating a BuildXL graph.

Existing plugin configurations retain the legacy exporter: `createOperationsAsync`, commands from
`getConfigHash()`, the original fields/cache policy, and empty-operation-set completion after `--drop-graph`.
No new Rush hook, consumer configuration, or `--no-daemon` requirement is imposed in this mode.
Existing daemon eligibility rules still apply. Invalid graphs are rejected; operation IDs are opaque,
including distinct IDs for operations sharing a phase. Legacy compatibility does not provide managed-sharding support.

## Opt-in execution contract

Set `"executionContractVersion": 1` alongside `buildXLCommandNames` in the plugin options only after the
external consumer supports the contract. Omit it to keep existing integrations unchanged.
Version 1 requires Rush's external execution hook and the graph's optional `createExecutionPlanAsync()` capability.
Version `1` (`repoSettings.executionContractVersion`) exports actual initial commands,
explicit non-secret `environmentVariables`, declared `outputFolderNames`, runner cache exclusions and
`warningsAreAllowed`. Apply the environment overrides, honor `cacheable: false` for reads and writes, and
allow diagnostic stderr only on warning-tolerant nodes. Never reconstruct commands from configuration hashes.

Export runs after all graph-created hooks and configures an execution plan without running operations,
cache hooks or local environment hooks. Disabled/no-op nodes are pruned while preserving dependency edges.
Only explicitly declared environment overrides are serialized, never the ambient environment. Custom runners
must expose `getCommandForExecution()`. Opted-in commands require `--no-daemon` even without `--drop-graph`;
watch export is unsupported. Exporting a graph alone does not upgrade a BuildXL/QTest integration.
Associate `--drop-graph` with the phased command, not its phases, so the export-only flag is not forwarded
to child commands. Planning and execution must use the same declared runtime/toolchain and semantic inputs.
Plugins must include semantic overrides in input/configuration identity; exporting an override does not hash it.
This generic contract does not implement Heft shard identity, manifests, collation, coverage or JUnit reporting.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/rush-plugins/rush-buildxl-graph-plugin/CHANGELOG.md) - Find
  out what's new in the latest version
