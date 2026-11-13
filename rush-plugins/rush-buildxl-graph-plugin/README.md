# @rushstack/rush-buildxl-graph-plugin

Rush plugin for generating a BuildXL graph.

Operation IDs are opaque: sharded phases have multiple operation IDs. Consumers must preserve the exported
commands and dependency IDs rather than reconstructing them from package and phase names.

Execution contract version `1` (`repoSettings.executionContractVersion`) exports actual initial commands,
explicit non-secret `environmentVariables`, declared `outputFolderNames`, runner cache exclusions and
`warningsAreAllowed`. Apply the environment overrides, honor `cacheable: false` for reads and writes, and
allow diagnostic stderr only on warning-tolerant nodes. Never reconstruct commands from configuration hashes.

Export runs after all graph-created hooks and configures an execution plan without running operations,
cache hooks or local environment hooks. Disabled/no-op nodes are pruned while preserving dependency edges.
Only explicitly declared environment overrides are serialized, never the ambient environment. Custom runners
must expose `getCommandForExecution()`; watch and daemon execution are unsupported (use `--no-daemon`).
External consumers must adopt this
contract; exporting a graph alone does not upgrade an existing BuildXL/QTest integration.
Associate `--drop-graph` with the phased command, not its phases, so the export-only flag is not forwarded
to child commands. Planning and execution must use the same declared runtime/toolchain and semantic inputs.
Plugins must include semantic overrides in input/configuration identity; exporting an override does not hash it.
This generic contract does not implement Heft shard identity, manifests, collation, coverage or JUnit reporting.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/rush-plugins/rush-buildxl-graph-plugin/CHANGELOG.md) - Find
  out what's new in the latest version
