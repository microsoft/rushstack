# Heft shard contracts

These are workload-neutral building blocks, not an enabled sharding mode. They do not schedule shards,
register collators, interpret Jest results, merge reports, or integrate with Rush caching.

## Identity and manifest

`parseShardPair()` accepts a strict `index/count` pair of positive safe integers with `index <= count`.
Indexes are 1-based. Formatting and folder helpers consume validated identities; shard temp folders include
both index and count (`shard-2-of-4`) so a different partition does not reuse the same temp state.

`IShardResultManifest` and `ShardStatus` are exported from `@rushstack/heft`. The helpers are available through
`@rushstack/heft/lib/sharding/ShardIdentity`, `ShardResultManifest`, `ShardFileSystem` and `ShardOutputOwnership`.
The version 1 `shard-manifest.json` envelope contains:

| Fields | Contract |
| --- | --- |
| `shardIndex`, `shardCount` | Positive safe integers identifying the partition. |
| `generation` | Nonempty semantic run identity supplied by the caller. |
| `producerAttempt` | Nonempty live-attempt identity from the acquired output claim, not a cache key. |
| `status` | `completed` includes completed work with diagnostics; `harness-failure` is not completion evidence. |
| `workload`, `startedAt`, `durationMs` | Nonempty workload name, ISO timestamp and nonnegative finite duration. |
| `diagnosticCount`, `itemCount` | Nonnegative safe integers; an empty partition is representable. |
| `payload` | Optional JSON-serializable workload data, opaque to the generic schema. |

Unknown versions, extra envelope fields and invalid field domains fail schema validation on read and write.
`tryReadShardResultManifestAsync()` returns `undefined` only for absence; malformed or corrupt data still throws.
Serialization is validated before publication. Schema validity alone does not establish a complete or current
run: consumers must check index/count agreement, missing or duplicate siblings, current expected generation,
workload/status agreement, aggregate count overflow and payload integrity before merging results. Generation
derivation, sibling coherence checks and workload payload validation are outside this foundation.

## Paths and exclusive ownership

Resolve build-root-relative configuration paths against the build root before calling the path helpers.
Outputs must be strict descendants of that root. Validation rejects traversal outside the root and symbolic
links/junctions below it, while allowing a symlinked workspace root. `resolveShardPathAsync()` resolves existing
ancestors without creating missing inputs; `resolveShardOutputPathAsync()` validates and materializes output
directories, but never creates a result file. It resolves physical aliases, including Windows short paths.

Pass canonical destinations to `acquireShardOutputLocksAsync()`. Claims exclude overlapping ancestors and
descendants, including overlap within one acquisition. Unicode composition is normalized; missing-name case
equivalence is probed directly in each differing component's actual parent, rather than assuming the lock
directory, platform or newly created subdirectories share its rules. These temporary prefixed-name probes
require existing, writable destination parents; call `resolveShardOutputPathAsync()` first. If a parent
disappears or a probe cannot be created, inspected or removed, acquisition fails rather than guessing.
A short registration gate serializes multi-output acquisition, not workload execution. Disjoint claim sets
can remain held concurrently.
Output contention fails immediately; registration contention has a two-second retry budget, not an I/O timeout.
Partial acquisition failures release acquired claims and surface cleanup failures.

Claims live in the reserved `<buildRoot>/.heft-jest-shard-locks` protocol namespace, outside shard outputs.
Despite its historical name, this namespace is workload-neutral. Never cache or broadly clean it. Claims record
the destination, attempt, host, PID, timestamps and optional operation identity for actionable contention errors.
They are not leases: age, PID reuse or malformed metadata never authorize automatic recovery. Remove only the
specific abandoned claim after verifying that its owning process, workers and pending writes have all stopped.

The caller must designate disjoint input/output locations, reject outputs overlapping source or payload inputs,
and retain ownership through all writes and cancellation cleanup. These helpers are cooperative process
coordination, not an OS sandbox against arbitrary writers or concurrent filesystem mutation.

## Publication lifecycle

Acquire ownership before invalidating a previous result. Invalidate only the known output file, publish payloads
first, then publish the manifest as the final commit marker. The atomic writer creates an exclusive staging
file beside its destination, writes and flushes it, closes it, and renames it. Pass the held claim as the
publication guard so ownership checking and promotion run synchronously without an intervening await.

Cancellation revokes publication but retains the physical claim until work and cleanup settle. A cancelled
publication removes only the file identity it published, never a replacement. Failed publication cleans its
own staging file without deleting unrelated outputs. Release is synchronous; released or revoked claims cannot
publish again. The caller must perform its final cancellation check before releasing ownership.
