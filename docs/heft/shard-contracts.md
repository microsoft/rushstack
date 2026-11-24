# Heft shard contracts

This foundation supplies folder and result-file helpers, not an enabled sharding mode. CLI parsing,
plugin context, scheduling, collation, and framework-specific payloads are separate integration work.

## Supplied folders

The orchestrator supplies a project-relative parent folder, a single-component name template containing
exactly one `{shardIndex}`, and a positive, safe-integer index/count. Indexes are 1-based. Heft does not invent
another shard layout: Rush's default `.rush/operations/_phase_test/shards/{shardIndex}` produces slots `1`,
`2`, and so on. Changing the count changes the partition/cache inputs, not the folder naming convention.

`getShardFolderConfiguration()` validates configuration without resolving paths, creating directories, or
inspecting the filesystem. Relative paths may contain `..` only while remaining below the project root.
Absolute/drive-relative paths, unresolved tokens, and nonportable path components are rejected.
`getShardFolderPath()` formats a relative slot; the caller joins it to the build root only at the I/O boundary.
`validateShardPath()` checks normalized absolute descendants by prefix. These are lexical checks, not
physical alias detection or a symlink sandbox; the orchestrator controls the supplied output locations.

Legacy Rush arguments have explicit adapters, not a second layout. `getShardFolderConfigurationFromPrefix()`
interprets `temp/shards/part-` as parent `temp/shards` plus template `part-{shardIndex}`; a trailing separator
means the numeric template. `getShardFolderConfigurationFromOutputDirectory()` removes exactly the known
index suffix from Rush's expanded output directory. Nested/multiple-token templates are unsupported.

Each producer uses Heft's existing phase/task suffix:
`<slot>/<producerPhase>/<producerTask>/shard-manifest.json`. `getShardTaskFolderPath()` constructs that
folder. Multiple tasks never share one slot-level manifest. The integration contract keeps the build/config
root unchanged, sets shard output/temp roots to the supplied slot, and retains phase/task temp isolation.
Collation addresses the declared producer phase/task in each expected slot. Its inputs are read-only; final
outputs and collation temp files must remain separate from those inputs.

## Completion evidence and caching

`IShardResultManifest` and `ShardStatus` are exported from `@rushstack/heft`; helpers are available through
the existing `lib/sharding` deep exports. The version 1 manifest contains index/count, producer `phaseName`,
completion status, timing/count metadata, and optional opaque payload. `completed` includes a workload that
finished with diagnostics; `harness-failure` is not completion evidence.

The orchestrator selects compatible results using its input/configuration and partition cache keys. Mixing
compatible restored and newly produced slots is expected. There is no invocation generation, producer-attempt
token, or timestamp equality requirement. The manifest identifies the configured producer phase, not a plugin
name or the collation action. Schema validity alone does not establish compatibility or a complete shard set.
Collation must validate every expected slot, its index/count and declared producer phase, completion status,
aggregate count bounds, and the adapter's payload. It must not scan arbitrary sibling folders for substitutes.

Unknown versions/fields and invalid domains fail read/write validation. Missing manifests return `undefined`
only from `tryReadShardResultManifestAsync()`; corrupt JSON and other filesystem errors still throw.

## Deterministic publication

The orchestrator schedules a single writer per slot/task and waits for all producer work and cancellation
cleanup before reading, restoring, cleaning, or reusing its outputs. This foundation adds no filesystem locks,
claim directories, case probes, or stale-owner recovery protocol.

Invalidate the known manifest before executing a producer; publish payloads before the final manifest.
`writeShardFileAtomicallyAsync()` takes an explicit deterministic staging path in the destination's directory,
writes and flushes it, closes it, and renames it. Staging names do not grow with destination basenames, so valid
long output names remain supported. The manifest uses `shard-manifest.partial.json`. A retry may overwrite its
own abandoned staging file; the caller owns and declares both paths.

No random filenames or folders are generated. Errors propagate, failed writes clean their staging file, and
cancellation invalidates only the file identity that was published, not a replacement. Callers must finish
their cancellation checks before releasing their scheduled writer responsibility.
