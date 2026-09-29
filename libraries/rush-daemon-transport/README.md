# @rushstack/rush-daemon-transport

> **Public beta** — this package is versioned at `0.x`; its API may change between minor versions.

The workspace-keyed socket/pipe **transport** for the Rush daemon (`rushd`):

- **Workspace keys** — `sha256(canonicalRepoRoot + rushVersion + startupOptions)`, so distinct
  workspaces, Rush versions, or startup options resolve to distinct daemon endpoints while the
  same workspace stays stable across runs.
- **Per-user path derivation** — Unix domain sockets in `/tmp/rushd-<uid>/` on POSIX, or in
  `$RUSHD_RUNTIME_DIR/rushd-<uid>/` when that variable is an absolute path, and
  `\\.\pipe\rushd-<key>` named pipes on Windows. `TMPDIR` and `XDG_RUNTIME_DIR` are not
  consulted, because they differ between the shells, jobs and services of one user. A daemon
  resolves its paths with the same rule, and a client that starts one passes the folder it
  chose as `RUSHD_RUNTIME_DIR`. The folder must be a directory (not a symbolic link) that the
  user owns; one that others can open is made owner-only (`0700`). The socket path must fit in
  a socket address, at most 108 bytes on Linux and 104 on other POSIX platforms, because Node.js
  silently truncates a longer one; a longer path is refused with `socketPathTooLong` before the
  folder is checked or created.
- **`net` listener and connector** — framed with
  [`@rushstack/rush-daemon-protocol`](https://www.npmjs.com/package/@rushstack/rush-daemon-protocol),
  with backpressure-aware writes and serialized async frame handlers for inbound flow control.
- **PID/lockfile handling** — stale sockets and dead PIDs are detected (two-factor: PID liveness
  plus a connect probe) and reclaimed without manual cleanup. On POSIX, a reclaim first stops the
  operations that the dead daemon left running. Both `reclaimStaleDaemonAsync` and
  `DaemonFrameListener.listenAsync` report each set of stopped process groups to `onOrphansReaped`,
  or, without it, as a `RUSH_DAEMON_ORPHANS_REAPED` process warning. A recorded operation group
  that the reclaim cannot prove is still the dead daemon's gets no signal. When such a group still
  has a live process, it is passed to `onOperationGroupLeftRunning`, if given, with the first check
  it failed; `formatOperationGroupLeftRunning` describes it in one line.
- **Two-phase shutdown** — `stopAcceptingAsync()` stops admission and waits for connections while
  retaining ownership. Hosts release the endpoint with `closeAsync()` after their resources have
  finished disposing. A live owner prevents rebinding even when its socket has already closed;
  repeated closes cannot remove a successor's endpoint.
- **Owner-safe publication** — a listener binds a private name and hard-links it to the socket
  path, so it never replaces a live peer's socket; the runtime folder's file system must support
  hard links. On close it removes the socket and ownership record only while they are still the
  files it created, so a predecessor that shuts down late never removes a successor's endpoint.

Part of the Rush 6 / rushd re-architecture:
[microsoft/rushstack#5894](https://github.com/microsoft/rushstack/issues/5894).

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/libraries/rush-daemon-transport/CHANGELOG.md) -
  Find out what's new in the latest version
- [API Reference](https://rushstack.io/pages/api/rush-daemon-transport/)

`@rushstack/rush-daemon-transport` is part of the **Rush Stack** family of projects.
