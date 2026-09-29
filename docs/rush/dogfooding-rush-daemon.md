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

The snapshot also contains Rush's built-in cloud build-cache plugins (`amazon-s3`, `azure-blob-storage` and
`http`), next to the `@microsoft/rush-lib` links of `@microsoft/rush`, `rush-client` and the daemon. A source-built rush-lib loads them
from there, and it points `_RUSH_LIB_PATH` at that same link. So plugins that resolve `@microsoft/rush-lib` by name
from `_RUSH_LIB_PATH` work in both the daemon and the in-process fallback. This repository's own build cache is
`local-only`, so it doesn't need them.

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
subspace. `rush-client rebuild` is also supported, as are the phased commands of command-line.json
(for example `rush-client test`). Commands share the warm graph where they can: a `test` graph also serves
`build` and `rebuild`, and a `build` graph serves `rebuild`. The first `rush-client test` after a build reloads
the graph once; later builds reuse the test graph. A custom command whose graph could not serve the current
graph's command either, such as `retest` (which is not incremental) after a build, runs in-process instead, so
that the two commands don't reload the graph on every switch. With `daemon.usePersistentIpcRunners`, a
command that is not incremental never runs on another command's graph, because persistent IPC runners serve
only incremental commands. After a `rush-client test`, for example, `rebuild` reloads the graph and `retest`
runs in-process.

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
   in-process reload (for example, the first request, or a configuration change). The command line of that
   `pid` runs `SelectedDaemonBootstrap.js` from `common/temp/rush-daemon-dogfood`, not from the workspace.
4. **Parity.** For the same selection, ordinary Rush produces the same outputs. For example, after a
   daemon-served build, `node common/scripts/install-run-rush.js rebuild --only @rushstack/tree-pattern`
   leaves the files in `lib-commonjs`, `lib-dts`, `lib-esm`, and `dist` unchanged.

A warm request whose selected operations are all up to date finishes **without printing anything**, and exits
with code `0`. Unlike ordinary Rush, the daemon client does not yet print a summary, so "no output" after a
build that already ran means everything was up to date; `rush-client daemon status` confirms that it was served.

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

On Windows, the first daemon start from a new or refreshed snapshot can take longer than the client's 15-second
startup deadline while Windows scans the newly written files. Because the startup helper is still waiting for the
daemon, the client says so and keeps trying for another 15 seconds, then uses the daemon once it is ready. If it is
still not ready, the request fails with exit code 1 and a `rush-client: ...` message that says Rush was not run
in-process, rather than running native Rush next to the starting daemon. The daemon finishes starting in the
background, so rerun the command (`rush-client daemon status` shows when it is ready).

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

- **Environment identity.** The request environment is a daemon input, apart from per-shell bookkeeping
  (such as `PWD`, `SHLVL`, `TERM`, `TERM_SESSION_ID`, `WSL_INTEROP`, and SSH or tmux session handles) and the
  client's own `RUSH_DAEMON` routing variables. Any other difference, such as a different `WT_SESSION` or
  `VSCODE_*` value from another terminal window, or a changed `PATH`, restarts the daemon before anything runs,
  and the new process then serves the request. This is not a fallback, but it costs a cold start and changes
  `pid`. Run related requests from the same terminal.
- **Only phased commands use the warm engine:** `build`, `rebuild`, and the phased commands of
  command-line.json. Global commands, `rush start` (which always watches),
  `--watch`, `--install`, `--variant`, and `--node-diagnostic-dir` stay native, as do build event-hook
  scripts (for `build` and `rebuild`, the only commands that run them) and reporter controls such as `--output`. Keep using ordinary Rush for `install`, `update`, and
  other commands. `rushx-client` keeps scripts attached to a TTY in-process.
- **No persistent Heft or TypeScript workers by default.** Each operation still starts its Heft process; the
  daemon saves Rush startup and graph construction, not compilation. The `usePersistentIpcRunners`/`daemonIpc`
  mode requires a bundled, self-contained worker entry point, and Heft is not packaged that way. See
  `daemon.warmWorkers` below for Heft workers that stay alive between builds.
- **`:incremental` scripts.** With `daemon.incrementalBuilds` (on by default), an operation whose project
  defines a `_phase:<name>:incremental` script runs it instead of the initial script when only files that the
  operation builds were edited since its last successful run in the daemon. The operation log then says
  `Invoking (incremental): ...`. An added, deleted or renamed input, a configuration, tool, environment or
  command-line change, a change to its output folders, bundled outputs, a cache restore or a native `rush`
  command make it run the initial script, and the log says why (`Not using the incremental command because
  ...`). Incremental results are never written to the build cache, and neither are the results of operations
  built against them. Set `RUSH_DAEMON_INCREMENTAL_BUILDS=0` to always run the initial script.
- **Warm workers.** With `daemon.warmWorkers` (or `RUSH_DAEMON_WARM_WORKERS=1`, off by default) and
  `incrementalBuilds`, an operation whose project defines a `_phase:<name>:incremental:ipc` script (for Heft,
  `heft run-watch --only <phase> --`) and whose `rush-project.json` operation settings set
  `"allowDaemonWarmWorker": true` runs its incremental builds in a worker started from that script. Set it only
  if the script, run in watch mode, runs every task and check that the initial script runs: the daemon reports
  a run on the worker as if the initial script had run, and `rush start` may run the same script with fewer
  tasks on purpose. Heft skips lint and API Extractor in watch mode unless the lint task sets heft-lint-plugin's
  `lintInWatchMode` option and `config/api-extractor-task.json` sets `runInWatchMode`; without them, a lint
  error does not fail the build, and consumers read a stale `.d.ts` rollup. A rig can set all three for its
  projects. The worker stays alive between builds and keeps its last build in memory, so the next build sends
  it another run instead of starting Heft again. The operation log says `Invoking (incremental): ...`, followed
  by `Starting a warm worker for it.` or `Sending run <n> to the warm worker (pid <pid>).`. When the rules above
  require the initial script, the worker is closed first (`Closing the warm worker (pid <pid>), because ...`),
  and that line is written even if the build cache then restores the operation. The initial script then runs
  as usual, or in a new worker if the project defines `_phase:<name>:ipc` (for Heft,
  `heft run-watch --only <phase> -- --clean`). A worker also accepts bundled outputs, because it keeps its
  bundler state in memory; if a run changes which output files exist, the initial script runs after it. If the
  run added or removed a file with a content hash in its name, as a bundler does when a chunk's content changes,
  the operation runs only its initial script from then on, until a request replaces the engine, because each
  later edit would rename the chunk again and leave the old one behind.
  A worker starts with `TSC_WATCHFILE=UseFsEventsOnParentDirectory` unless the operation's environment sets
  `TSC_WATCHFILE`. On Linux and macOS, TypeScript's default file watcher follows each file's inode, and after Git
  replaces a file it can lose track of that file for the life of the process, so the worker would miss every later
  edit to the file and keep its stale outputs, with no error. TypeScript reads the variable only if
  `tsconfig.json` does not set `watchOptions.watchFile`. The variable's watcher fails loudly instead: on Linux,
  if a source file is missing when a run on the worker updates the TypeScript program, for example because a
  checkout deleted it during the build and then restored it, TypeScript never finds that file again in the
  process. The run usually fails with error `TS6053` (file not found), or with `ENOENT` if a whole folder was
  missing, and like any failed run it closes the worker (see below), so it costs a failed run but leaves no stale
  outputs. But if Heft sees the change while the run is in progress, it runs its tasks again, and the last pass
  decides the result. The run can then succeed with warnings, which fails the build unless the phase sets
  `allowWarningsOnSuccess`, but nothing runs again and the worker stays alive. The next build does not reuse that
  worker if a folder that held the operation's input files was recreated (see below), or if the build cache is
  enabled for the operation, because input files that changed while an operation ran make its result
  unverifiable. A single file that is deleted and restored keeps its folder, so neither check applies to it, but
  a program that still misses the file reports `TS6053` again in the next run on the worker, which then fails
  and closes the worker as above.
  A watcher of a folder can also miss every later change in it once the folder is deleted and created again, for
  example by a branch switch that removed the folder and then restored it. So the next build runs the initial
  script if a folder that held the operation's input files was deleted or recreated since the last run on the
  worker (`Not using the incremental command because folders that held its input files were deleted or
  recreated since its last run (...)`), even if the files kept their content. The daemon compares each folder's
  inode and creation time; a file that an editor saves by renaming a new file over it does not count. The
  message names only the top folder of a recreated tree.
  A worker's outputs are only as current as Heft's watchers. A change that a watcher misses is not built, and
  because the run still succeeds, later builds report the operation as up to date and keep the stale outputs
  until the file is edited again. The checks above cover the cases found in testing: a file that Git replaces, a
  folder that is recreated, and a file that is missing while a run updates TypeScript. A case that none of them
  covers would leave stale outputs without an error.
  A reused worker can fail where the initial script passes, for example after Git rewrites the `package.json` of
  a dependency, because some tools keep state between runs. So if a run on a reused worker fails, or the worker
  exits during a run, the worker is closed and the initial script runs in the same build
  (`Running the initial command, because the run on the warm worker failed.`), and the operation fails only if
  the initial script fails too. A genuine error then costs an extra run of the initial script. The failed first
  run of a new worker is reported as it stands, because that run had no earlier state. The build cache is not
  read for a run on a live worker. A worker is closed after its operation fails, because the next build runs the
  initial script, and after 25 runs or once its memory doubles. Builds that follow each other within seconds can
  double a worker's memory in a few runs without a leak, because V8 collects each run's garbage later, while the
  worker is idle: with API Extractor in watch mode, a small package's worker grew by 120 to 180 MB per run and was
  replaced every 4 or 5 runs, but with 20 seconds between builds it stayed flat. Workers count toward
  `warmMemoryBudgetMB` and `warmSetMaxProjects`. Over either limit, or once no build has included a project for
  `warmIdleTimeoutSeconds`, the warm set closes the project's workers and drops its last results, so its next
  build runs the initial script (`The warm worker (pid <pid>) was closed after the operation last ran.`). The
  default budget, 512 MiB, includes the daemon itself and leaves room for few workers, so raise both limits when
  you turn workers on. A request that replaces the engine, e.g. a `rebuild` after a `build`, closes every worker
  without a note, and each operation's next build runs the initial script.
- **Plugins.** This repository's only configured plugin, `@rushstack/rush-published-versions-json-plugin`,
  is associated only with `record-published-versions` and is inert for builds. A plugin without
  `associatedCommands`, a plugin associated with `build` or `rebuild`, or a plugin command-line that defines
  the command, one of its phases, or a parameter for either would make those builds fall back to native Rush,
  unless the plugin is declared daemon-compatible. See
  [Rush plugins in daemon engines](#rush-plugins-in-daemon-engines).
- **Windows.** Native Windows validation of the daemon code saw unresolved, intermittent failures in which
  Git `hash-object --stdin-paths` exited with `0xC0000142` (DLL initialization failed) while the daemon
  captured workspace snapshots under Jest. Direct fixtures did not reproduce it, and it did not occur while
  this workflow was validated on native Windows. The cause is unresolved, so treat it as an open risk: if a
  daemon-served build fails this way, retry it with `--no-daemon` and report the failure.
  The daemon runs without a console, so it starts its tools (Git, tar and operation shells) with hidden
  windows. Daemons started from a snapshot older than that change open a visible terminal window for each
  tool; if you see that, [refresh the snapshot](#refresh-the-snapshot).
- **CI** stays in-process unless `RUSH_DAEMON=1` is set; do not set it in CI workflows.

## Rush plugins in daemon engines

A daemon engine applies each Rush plugin once and then serves many requests from one long-lived process.
A plugin written for a single native command can therefore misbehave, so the daemon serves a `build` or
`rebuild` that a configured plugin participates in only if the plugin is declared daemon-compatible. A plugin
participates if it has no `associatedCommands` (Rush initializes it for every command), is associated with
the command, or its command-line.json defines the command, one of its phases, or a parameter for either.
Any other plugin is inert for the build and needs no declaration.

Declare a plugin in one of these ways:

- **The plugin author** sets `"daemonCompatible": true` on the plugin's entry in `rush-plugin-manifest.json`.
  Releases whose schemas predate this setting reject such a manifest, and then every command fails, not only
  builds. Set it only in plugin versions that are installed with a Rush release that accepts it, as with the
  `@rushstack` plugins, which are versioned with Rush; otherwise leave the declaration to repositories.
- **The repository** lists the plugin's `pluginName` from `rush-plugins.json` in the `rush.json` setting
  `"daemon": { "compatiblePlugins": [...] }`, after verifying the plugin against the contract below.
- **One shell** sets `RUSH_DAEMON_COMPATIBLE_PLUGINS` to a comma-separated list of plugin names, which
  replaces the `rush.json` list; an empty value lists no plugins. Releases whose schemas predate these
  settings reject the manifest and `rush.json` keys, so a repository that still selects such a release can
  only use this variable, and only for `rush-client`. The value is part of the daemon's environment
  identity, so changing it starts a new daemon.

A listed name that matches no configured plugin has no effect; the request that creates the daemon's engine
prints a warning, which the daemon's launcher log also keeps. An undeclared participating plugin makes the
request fall back to native Rush, with a message that names the plugin and each reason.

The engine lifecycle that a declared plugin must support:

- **Once per engine:** the plugin's `apply()`, `runAnyPhasedCommand`, `runPhasedCommand.for(<command>)`,
  `createOperationsAsync` and `onGraphCreatedAsync`. The engine builds the graph for every project, with
  `isWatch` false; each request then selects operations from it. A request whose parameters differ from the
  engine's (other than project selection, `--include-phase-deps`, `--ignore-hooks`, `--verbose`, `--parallelism`
  and `--timeline`) or a changed
  configuration file replaces the engine, and the new engine applies the plugin again in the same process.
  Module-level state therefore outlives an engine. An engine serves another command, such as `rebuild` on a
  `build` engine, only if the same plugins are associated with both commands, no plugin taps the
  `runPhasedCommand` hook of either command, and every plugin that taps `runAnyPhasedCommand` is declared
  command-agnostic (below), because Rush calls these hooks only with the command that created the engine.
- **Once per iteration:** the operation graph hooks, such as `configureIteration`,
  `beforeExecuteIterationAsync`, `before`/`afterExecuteOperationAsync`, `createEnvironmentForOperation` and
  `afterExecuteIterationAsync`. One iteration can serve several concurrent requests. If every operation that
  a request selects is up to date, the daemon aborts the iteration before it runs anything, so
  `beforeExecuteIterationAsync` and the operation hooks don't fire. Don't rely on iteration hooks for
  per-request work.
- **Disposal:** the engine aborts `IOperationGraph.abortController`, cancels the current iteration, and then
  closes every operation runner. Release resources from the abort signal or the runner's `closeAsync()`.

Rules for a daemon-compatible plugin:

- Don't change process globals: no writes to `process.env`, `process.exitCode`, the current directory or
  `process.argv`, and no patching or clearing of global functions such as `setTimeout`. They belong to the
  daemon and to every other request.
- Keep request-specific state per iteration, not per process or per engine (session IDs, start times,
  performance marks).
- Never prompt. The daemon has no terminal; fail fast with a message that the requesting client sees, and
  continue without the feature where possible.
- Read the operation's environment (from `createEnvironmentForOperation`), not the daemon's `process.env`.
- Write output through the session's logger. Output written while an iteration runs reaches that iteration's
  clients, and output written while the engine is created reaches the request that created it; the daemon
  drops output written between iterations.

A plugin that taps `runAnyPhasedCommand` keeps an engine from serving any command other than the one that
created it, unless the plugin is also declared command-agnostic: what it does from that hook doesn't depend on
the command. Its callbacks there, and the command hooks that they tap in turn (such as `createOperationsAsync`
and `onGraphCreatedAsync`), don't read the command's name, its parameters, its phase selection or
`isIncrementalBuildAllowed`. A plugin that only reads `isWatch`, for example, is command-agnostic. Declare it the
same three ways as above: `"daemonCommandAgnostic": true` in the manifest, the `rush.json` setting
`"daemon": { "commandAgnosticPlugins": [...] }`, or `RUSH_DAEMON_COMMAND_AGNOSTIC_PLUGINS` in one shell. The
same release rules apply: releases whose schemas predate these settings reject them, and then only the
variable works, only for `rush-client`, and only with an engine that recognizes it. The declaration covers only
the taps that the plugin's `apply()` adds; a tap added later, an interceptor on the hook, or a tap of
`runPhasedCommand` still keeps the engine to its own command. When a plugin keeps an engine to its own command,
a request of another command replaces the engine, or, for a `rush-client` custom command that neither engine
could serve, falls back to native Rush with a message that names the plugin.
Node.js loads a plugin's code only once, so the daemon treats the installed package folder of every configured
plugin as part of its implementation: a change to a plugin's `.js` or `.json` files, including through a
`link:` dependency, starts a new daemon for the next request. Declaration (`lib-dts`) and ES module (`lib-esm`)
output folders are left out, because a plugin's CommonJS entry point doesn't load them.

## Version skew and `RUSH_PREVIEW_VERSION`

`rush-client` runs the daemon with its bundled engine only if that engine's version equals the selected Rush
version (`RUSH_PREVIEW_VERSION`, otherwise `rushVersion` in `rush.json`). Today both are the same, so the
snapshot's engine is used. If a release bumps `apps/rush` and `libraries/rush-lib` without updating
`rushVersion`, the client instead looks for a daemon-capable published release of the selected version.
None exists, so every build falls back to native Rush, with a `rush-client: ...; using in-process Rush.`
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
