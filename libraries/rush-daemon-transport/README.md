# @rushstack/rush-daemon-transport

> **Public beta** — this package is versioned at `0.x`; its API may change between minor versions.

The workspace-keyed socket/pipe **transport** for the Rush daemon (`rushd`):

- **Workspace keys** — `sha256(canonicalRepoRoot + rushVersion + startupOptions)`, so distinct
  workspaces, Rush versions, or startup options resolve to distinct daemon endpoints while the
  same workspace stays stable across runs.
- **Per-user path derivation** — `$XDG_RUNTIME_DIR`-aware Unix domain sockets on POSIX and
  `\\.\pipe\rushd-<key>` named pipes on Windows.
- **`net` listener and connector** — framed with
  [`@rushstack/rush-daemon-protocol`](https://www.npmjs.com/package/@rushstack/rush-daemon-protocol),
  with backpressure-aware writes.
- **PID/lockfile handling** — stale sockets and dead PIDs are detected (two-factor: PID liveness
  plus a connect probe) and reclaimed without manual cleanup.

Part of the Rush 6 / rushd re-architecture:
[microsoft/rushstack#5894](https://github.com/microsoft/rushstack/issues/5894).

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/libraries/rush-daemon-transport/CHANGELOG.md) -
  Find out what's new in the latest version
- [API Reference](https://rushstack.io/pages/api/rush-daemon-transport/)

`@rushstack/rush-daemon-transport` is part of the **Rush Stack** family of projects.
