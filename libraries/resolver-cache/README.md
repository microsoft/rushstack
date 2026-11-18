# @rushstack/resolver-cache

A dedicated binary format for the Rush resolver cache, plus helpers for hashing and slicing the
dependency graph that it describes.

This package intentionally has no runtime dependencies, so that a consumer such as a Webpack plugin
can decode a cache without taking a dependency on `@microsoft/rush-lib`.

## The format

The format is optimized for a single linear decode; full decode is cheap enough that random access
is not worth the extra complexity.

- **Strings** are stored once, in a lexicographically sorted, front-coded table. Each entry is a
  `[prefixIndexDelta, suffixLengthInCharacters]` pair, where the prefix is the complete value of the
  entry `prefixIndexDelta` positions earlier. The table is closed under branch-point prefixes, so a
  suitable prefix always exists. All suffixes share one UTF-8 blob, which the decoder decodes exactly
  once and then indexes with `substring`.
- **Suffix lengths are measured in UTF-16 code units**, not bytes and not code points. Byte lengths
  would force a separate decode per entry; code points would disagree with `substring`. An encoder
  written in another language must match this definition.
- **Integers** are LEB128 varints, and are stored as deltas against a nearby value (the previous
  dependency key, or the ordinal of the context being decoded) so that they almost always fit in a
  single byte.

## Context identity

A context is identified solely by its root path. Contexts that share a package name and version but
differ in root path are distinct and must never be merged. In particular, a PNPM injected dependency
resolves its own dependencies within the consuming subspace, so it has a different dependency graph
than the workspace project it was copied from, and the same project may be injected more than once
with different peer resolutions.

## Hashes

`computeContextHashes` produces a Merkle hash for each context. The preimage is purely
lockfile-derived: the root path and name of the context, its dependency keys, and the hashes of the
contexts those keys resolve to. File contents, build outputs, and timestamps are excluded, because
Rush tracks those separately through the build graph. The hashes are therefore computable from a
checkout that has never been installed.

Contexts that participate in a dependency cycle are condensed into a strongly connected component
and hashed as a unit.

## Links

- [CHANGELOG.md](https://github.com/microsoft/rushstack/blob/main/libraries/resolver-cache/CHANGELOG.md) - Find
  out what's new in the latest version

`@rushstack/resolver-cache` is part of the [Rush Stack](https://rushstack.io/) family of projects.
