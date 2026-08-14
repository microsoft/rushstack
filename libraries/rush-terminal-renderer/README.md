# @rushstack/rush-terminal-renderer

> **Public beta** — this package is versioned at `0.x`; its API may change between minor versions.

The CLI client's **presentation layer** for the Rush daemon (`rushd`):

- **Reporter host** — drives event renderers from the daemon's `0x05` event stream; the host
  interface mirrors `@rushstack/reporter`'s `IReporter` so its `default`/`ai`/`plaintext`
  reporters drop in unchanged.
- **Faithful collation** — hosts `@rushstack/stream-collator` client-side, reproducing the
  legacy in-process terminal output (per-operation blocks and `==[ name ]===[ x of y ]==`
  headers) byte-for-byte from id-tagged raw streams.
- **Per-client verbosity** — quiet/verbose/debug filtering applied at event serialization and
  display, never mutating shared engine state; concurrent clients each get their own subset.
- **Terminal capability threading** — computes `FORCE_COLOR`/`COLUMNS` for child processes from
  each client's request envelope; non-TTY children receive neither.

Part of the Rush 6 / rushd re-architecture:
[microsoft/rushstack#5894](https://github.com/microsoft/rushstack/issues/5894).

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/libraries/rush-terminal-renderer/CHANGELOG.md) -
  Find out what's new in the latest version
- [API Reference](https://rushstack.io/pages/api/rush-terminal-renderer/)

`@rushstack/rush-terminal-renderer` is part of the **Rush Stack** family of projects.
