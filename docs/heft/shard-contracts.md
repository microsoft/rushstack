# Heft shard contracts

Heft exposes the orchestrator's shard layout and mode to plugins and provides addressed manifest collation.
Scheduling, build-cache selection, and framework-specific payloads remain the orchestrator's and plugins' responsibility.

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

## Heft modes

Shard actions accept `--shard=2/3` and Rush's `--shard-output-directory=temp/shards/part-2`.
Collation accepts `--shard-count=3 --shard-parent-folder=temp/shards/part-` using the legacy prefix semantics.
For either mode, an explicit `--shard-parent-folder=temp/shards --shard-folder-name-template=part-{shardIndex}`
supplies a real parent folder and bypasses prefix inference. If also supplied, the exact output directory must agree.
Heft rejects conflicting or incomplete arguments, `--clean`, and watch mode before plugins are applied.

All task and lifecycle plugins receive `HeftConfiguration.sharding` during `apply()`: `undefined` for an
ordinary action, or a context with `mode: 'shard' | 'collate'`, normalized layout, and expected count.
The configured source `buildFolderPath` is unchanged. In shard mode, `outputFolderPath` and `tempFolderPath`
are the selected slot; each task's temp folder retains its phase/task suffix. In collation mode, output and
temp roots retain ordinary project locations, outside the shard inputs. `taskSession.phaseName` identifies
the configured phase, independent of action aliases. Plugins must not run their ordinary workload in collation mode.

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

## Collation adapters

In selected collation mode, register exactly one adapter using
`taskSession.registerShardCollator(adapter, { producerPhaseName, producerTaskName })`.
Both producer names are explicit, so a differently named collation task can address the original producer.
Check that the optional registration capability exists and throw an actionable upgrade error if absent;
never silently skip collation. This check alone does not establish older-host import or manifest compatibility.

`readShardResultsAsync()` reads only the declared task within scheduled slots matching the template, rejecting
addressed symlinks, non-file manifests, and slot/index mismatches. Unrelated folders and obsolete extra slots
are not substitutes for missing results. `loadShardResultsAsync()` additionally checks complete indexes,
counts, the declared producer phase, completed harnesses, and safe aggregate counters. Results are ordered by
index; violations are deterministic, and large missing-index gaps are compressed rather than enumerated.

An adapter opens a resource lifecycle, invalidates its previous reports in `prepareAsync()`, validates opaque
payloads, and publishes reports in `collateAsync()`. Return completed workload failures as diagnostics, never
fewer than the manifest total; throw infrastructure errors. Heft owns the final verdict. Infrastructure errors
or cancellation after publication invalidate the report again, including at the outer logging boundary.
Cleanup must work with an aborted signal; synchronous release follows all work and preserves prior failures.
The adapter must prevent output/input overlap. This layer adds no filesystem ownership locks.

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
