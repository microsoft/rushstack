# Dogfooding the Rush daemon in rushstack

This guide is for contributors who want to build the rushstack repository with the opt-in Rush daemon
(`rush-client`, from [`apps/rush-cli-client`](../../apps/rush-cli-client/README.md)) **before** a published
Rush release contains it. Ordinary `rush`, `rushx`, and CI are unaffected: they keep running in-process
unless you opt in explicitly.

Nothing described here is published yet, so the client is built from source. The daemon must not run
directly from the workspace's build outputs: rebuilding `@microsoft/rush-lib`, `@rushstack/rush-daemon`, or
`@rushstack/rush-cli-client` would replace modules that the long-lived daemon is executing. Instead,
`rush deploy` extracts a stable, self-contained snapshot of the built client closure into the gitignored
`common/temp/rush-daemon-dogfood` folder, and the daemon runs from that snapshot.

## Prerequisites

- A supported Node.js version (see `nodeSupportedVersionRange` in `rush.json`) and Git.
- A completed install: `node common/scripts/install-run-rush.js install`.
- No `.env` file in the repository root or in `~/.rush-user/`. The daemon does not support `.env`
  initialization and would fall back to in-process Rush.
- The source-built Rush version must equal the repository's `rushVersion`. Compare the output of
  `node -p "require('./apps/rush/package.json').version"` with the `rushVersion` field in `rush.json`.
  If they differ, see [Version skew](#version-skew-and-rush_preview_version).

> **Do not export `RUSH_DAEMON` in a shell that also runs ordinary `rush`.** The published Rush release that
> `rush.json` currently selects rejects unrecognized `RUSH_` environment variables, so
> `node common/scripts/install-run-rush.js ...` fails with
> `The following environment variables were found with the "RUSH_" prefix, but they are not recognized`.
> The shell functions below set `RUSH_DAEMON=1` only for `rush-client` invocations.
>
> **Do not add a `daemon` block to `rush.json` yet.** The published schema rejects it, which would break
> ordinary `rush` and CI. Opting in with the environment variable is sufficient.

## 1. Build the client closure

```bash
node common/scripts/install-run-rush.js build --to @rushstack/rush-cli-client
```

## 2. Create the snapshot

If a daemon from an earlier snapshot is running, stop it first (see [Refresh](#refresh-the-snapshot)).
Then extract the snapshot with the `rush-daemon-dogfood` deployment scenario
([`common/config/rush/deploy-rush-daemon-dogfood.json`](../../common/config/rush/deploy-rush-daemon-dogfood.json)):

```bash
node common/scripts/install-run-rush.js deploy --scenario rush-daemon-dogfood --target-folder common/temp/rush-daemon-dogfood --overwrite
```

The snapshot contains copies of the built Rush projects and their npm dependencies, with links that stay
inside the snapshot. To confirm that the client resolves its engine from the snapshot rather than from the
workspace, run the following from the repository root. It must print a path under
`common/temp/rush-daemon-dogfood`:

```bash
node -p "require('fs').realpathSync(require.resolve('@microsoft/rush-lib', { paths: [require('path').resolve('common/temp/rush-daemon-dogfood/apps/rush-cli-client')] }))"
```

The built-in cloud build-cache plugins are not part of the snapshot. That is fine for this repository, whose
build cache is `local-only`.

## 3. Opt in and build

Define a `rush-client` function in the terminal you will use, from the repository root.

Bash:

```bash
DOGFOOD_SNAPSHOT="$PWD/common/temp/rush-daemon-dogfood"
rush-client() { RUSH_DAEMON=1 node "$DOGFOOD_SNAPSHOT/apps/rush-cli-client/bin/rush-client" "$@"; }
```

PowerShell:

```powershell
$DogfoodSnapshot = "$PWD\common\temp\rush-daemon-dogfood"
function rush-client {
  $env:RUSH_DAEMON = '1'
  try { node "$DogfoodSnapshot\apps\rush-cli-client\bin\rush-client" @args } finally { Remove-Item Env:RUSH_DAEMON }
}
```

Then build as usual. The first request starts the daemon and constructs the all-project graph; later
compatible requests from the same terminal reuse it:

```bash
rush-client build --to @rushstack/tree-pattern
rush-client build --to @rushstack/tree-pattern
```

Any project selection that `rush build` accepts works, including projects in the `build-tests-subspace`
subspace. `rush-client rebuild` is also supported.

## 4. Confirm that the daemon served the build

Enabling the daemon is not proof that a build used it: unsupported requests silently or explicitly use
in-process Rush. Check all of the following:

1. **No fallback.** When the client does not use the daemon, it runs native Rush, which prints the
   `Rush Multi-Project Build Tool` banner. If the daemon was selected but could not serve the request, stderr
   also contains a line starting with `rush-client:` and ending with `using in-process Rush.` A
   daemon-served build prints neither.
2. **A warm graph.** `rush-client daemon status` prints one JSON object. `workspace.graphInitialized` must be
   `true`.
3. **The same process.** `pid` and `workspace.generationToken` stay the same across requests from the same
   terminal. `workspace.lastReloadTier` is `0` when the request reused the existing graph, and `1` after an
   in-process reload (for example, the first request, or a configuration change).
4. **Parity.** For the same selection, ordinary Rush produces the same outputs. For example, after a
   daemon-served build, `node common/scripts/install-run-rush.js rebuild --only @rushstack/tree-pattern`
   leaves the files in `lib-commonjs`, `lib-dts`, `lib-esm`, and `dist` unchanged.

A warm request whose selected operations are all up to date can finish without printing anything, and exits
with code `0`.

For example, in one Bash terminal after steps 1–3:

```bash
rush-client build --to @rushstack/tree-pattern 2>&1 | tee /tmp/dogfood-build.log
grep -E 'in-process Rush|Rush Multi-Project Build Tool' /tmp/dogfood-build.log && echo 'NOT served by the daemon'
rush-client daemon status   # graphInitialized: true; note pid and generationToken
echo "// throwaway" >> libraries/tree-pattern/src/index.ts
rush-client build --to @rushstack/tree-pattern   # rebuilds tree-pattern in the same daemon
rush-client daemon status   # same pid and generationToken
git checkout -- libraries/tree-pattern/src/index.ts
```

In PowerShell, use `rush-client build --to @rushstack/tree-pattern *>&1 | Tee-Object dogfood-build.log` and
`Select-String -Path dogfood-build.log -Pattern 'in-process Rush', 'Rush Multi-Project Build Tool'`.

## Use native Rush for one command

Pass `--no-daemon` to run a single `rush-client` command in-process:

```bash
rush-client build --no-daemon --to @rushstack/tree-pattern
```

Ordinary `node common/scripts/install-run-rush.js ...` commands also keep working while the daemon is
running. The daemon holds the Rush lock only while it prepares or executes a request, not while idle.

## Refresh the snapshot

The snapshot does not pick up later source changes to Rush itself; after changing or pulling changes to
`libraries/rush-lib`, `libraries/rush-daemon`, `libraries/rush-client-core`, or `apps/rush-cli-client`, refresh it.
Stop the daemon first, because `--overwrite` deletes the files that a running daemon executes:

```bash
rush-client daemon stop
node common/scripts/install-run-rush.js build --to @rushstack/rush-cli-client
node common/scripts/install-run-rush.js deploy --scenario rush-daemon-dogfood --target-folder common/temp/rush-daemon-dogfood --overwrite
```

The daemon's identity is the canonical repository root plus the selected Rush version, so each checkout or
worktree has its own daemon, and `rush-client daemon ...` commands address the daemon for the checkout that
contains the current directory.

## Stop and clean up

```bash
rush-client daemon stop     # prints state "shutdownAccepted"
rush-client daemon status   # exits with code 1: no daemon is listening
rush-client daemon logs     # launcher log, available even after the daemon stopped
```

Remove the snapshot with `rm -rf common/temp/rush-daemon-dogfood` (or `rush purge`, which clears all of
`common/temp`). Stop the daemon before purging or reinstalling.

## Known limits

- **Environment identity.** The complete request environment is a daemon input. A request whose
  environment differs from the daemon's, such as one from another terminal (with a different `WT_SESSION`,
  `WSL_INTEROP`, `TERM_SESSION_ID`, or `VSCODE_*` value) or after changing `PATH`, restarts the daemon before
  anything runs and is then served by the new process. This is not a fallback, but it costs a cold start and
  changes `pid`. Run related requests from the same terminal.
- **Only phased `build` and `rebuild` use the warm engine.** `rush start` (which always watches),
  `--watch`, `--install`, `--variant`, and `--node-diagnostic-dir` stay native, as do build event-hook
  scripts and reporter controls such as `--output`. Keep using ordinary Rush for `install`, `update`, and
  other commands. `rushx-client` keeps scripts attached to a TTY in-process.
- **No persistent Heft or TypeScript workers.** Each operation still starts its Heft process; the daemon
  saves Rush startup and graph construction, not compilation. The `usePersistentIpcRunners`/`daemonIpc`
  mode requires a bundled, self-contained worker entry point, and Heft is not packaged that way.
- **Plugins.** This repository's only configured plugin, `@rushstack/rush-published-versions-json-plugin`,
  is associated only with `record-published-versions` and is inert for builds. A plugin without
  `associatedCommands`, a plugin associated with `build` or `rebuild`, or a plugin command-line that defines
  the command, one of its phases, or a parameter for either would make those builds fall back to native Rush.
- **Windows.** Native Windows validation of the daemon code saw unresolved, intermittent failures in which
  Git `hash-object --stdin-paths` exited with `0xC0000142` (DLL initialization failed) while the daemon
  captured workspace snapshots under Jest. Direct fixtures did not reproduce it. If a daemon-served build
  fails this way, retry it with `--no-daemon` and report the failure.
- **CI** stays in-process unless `RUSH_DAEMON=1` is set; do not set it in CI workflows.

## Version skew and `RUSH_PREVIEW_VERSION`

`rush-client` runs the daemon with its bundled engine only if that engine's version equals the selected Rush
version (`RUSH_PREVIEW_VERSION`, otherwise `rushVersion` in `rush.json`). Today both are the same, so the
snapshot's engine is used. If a release bumps `apps/rush` and `libraries/rush-lib` without updating
`rushVersion`, the client instead looks for a daemon-capable published release of the selected version.
None exists, so every build falls back to native Rush, with a `rush-client: ... Using in-process Rush.`
message (see [Confirm](#4-confirm-that-the-daemon-served-the-build)).

To keep dogfooding in that state, select the snapshot's exact version for `rush-client` invocations only:

```bash
DOGFOOD_VERSION=$(node -p "require('./common/temp/rush-daemon-dogfood/libraries/rush-lib/package.json').version")
rush-client() { RUSH_DAEMON=1 RUSH_PREVIEW_VERSION="$DOGFOOD_VERSION" node "$DOGFOOD_SNAPSHOT/apps/rush-cli-client/bin/rush-client" "$@"; }
```

Side effects:

- The build runs with the snapshot's engine rather than the repository's selected release.
- `RUSH_PREVIEW_VERSION` is part of the daemon's identity and environment, so `rush-client daemon status`
  and `rush-client daemon stop` address the matching daemon only when the same value is set.
- A native fallback, including `--no-daemon`, also selects that version. Because it equals the snapshot's
  own frontend version, the snapshot's source-built Rush runs in-process, printing the
  `RUSH_PREVIEW_VERSION` warning banner, rather than the repository's selected release. Use ordinary
  `node common/scripts/install-run-rush.js ...` for builds with the selected release.
- Never export `RUSH_PREVIEW_VERSION` to ordinary `rush`; it would try to install that version from npm.

## After a release contains the daemon

Once a published Rush release includes the daemon, the standalone client, and the plugin narrowing that lets
this repository's command-scoped plugin coexist with daemon builds:

1. Update `rushVersion` in `rush.json` to that release (or a later one).
2. Optionally add `"daemon": { "enabled": true }` to `rush.json`, so that `rush-client` uses the daemon
   without `RUSH_DAEMON=1`. CI still stays in-process unless it sets `RUSH_DAEMON=1`, and `RUSH_DAEMON=0`
   opts a shell out.
3. Install the published client whose engine matches `rushVersion`, for example
   `npm install --global @rushstack/rush-cli-client`, and run `rush-client` directly instead of the snapshot.
4. Stop any snapshot daemon and delete `common/temp/rush-daemon-dogfood`. The `rush-daemon-dogfood`
   deployment scenario remains useful for trying unreleased daemon changes.
