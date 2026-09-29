# Experimental daemon and reporter environment variables

This reference supplements the published [Rush environment-variable reference](https://rushjs.io/pages/configs/environment_vars/)
for the opt-in implementation in this branch. The website source is maintained separately in
[`microsoft/rushstack-websites`](https://github.com/microsoft/rushstack-websites/blob/main/websites/rushjs.io/docs/pages/configs/environment_vars.md);
these entries must accompany publication of the corresponding Rush release. They do not describe
daemon support in older installed versions.

## Daemon execution

The separate `rush-client` and `rushx-client` executables consume these settings. Ordinary
`rush` and `rushx` keep their existing defaults. Configuration precedence is **environment,
then the `daemon` block in `rush.json`, then defaults**. Explicit `--no-daemon`, help and
never-daemonize requests retain native execution. CI also stays native unless `RUSH_DAEMON=1`
explicitly opts in. An incompatible engine, unsupported command or terminal requirement can
still require pre-execution native fallback; enabling the daemon is not proof a build used it.

Boolean variables accept exactly `0` or `1`, not `true` or `false`. Numeric variables accept
unsigned decimal notation, without whitespace, signs or exponents. Unknown `RUSH_DAEMON*`
variables and invalid values are errors, not ignored settings.

| Variable | Default | Meaning and limits |
| --- | --- | --- |
| `RUSH_DAEMON` | `0` | Opt into daemon execution through the separate clients. `0` disables it. Overrides `daemon.enabled`. |
| `RUSH_DAEMON_AUTO_START` | `1` | Start an absent compatible daemon after daemon execution is selected. Does not itself opt in. Overrides `autoStart`. |
| `RUSH_DAEMON_IDLE_TIMEOUT_SECONDS` | `900` | Shut down after the last pending request, output drain and cleanup are complete. Positive seconds, at most 2147483.647. Overrides `idleTimeoutSeconds`. |
| `RUSH_DAEMON_QUEUE_TIMEOUT_SECONDS` | `30` | Maximum request admission wait. Nonnegative seconds, at most 2147483.647; converted to whole milliseconds by rounding down. Time behind another request's load of the workspace graph (up to 10 times this value) does not count. Per-invocation `--wait-timeout` or `--no-wait` takes precedence. Overrides `queueTimeoutSeconds`. |
| `RUSH_DAEMON_WATCH` | `0` | Observe requested warm projects between requests. Never schedules builds and does not enable `--watch` mode. Root/config guards and request-time input reconciliation remain active when disabled. Overrides `watch`. |
| `RUSH_DAEMON_USE_PERSISTENT_IPC_RUNNERS` | `0` | Enable explicitly configured `operationSettings[].daemonIpc` Node workers for supported incremental daemon builds. Does not convert arbitrary shell scripts into persistent workers. Overrides `usePersistentIpcRunners`. |
| `RUSH_DAEMON_INCREMENTAL_BUILDS` | `1` | Let daemon builds run an operation's `<phase>:incremental` script on top of the outputs of its last successful run in the daemon, when only files that it builds were edited and its output folders are unchanged. Otherwise the initial script runs, as it does for native Rush. `0` always runs the initial script. Incremental results are never written to the build cache. Overrides `incrementalBuilds`. |
| `RUSH_DAEMON_WARM_WORKERS` | `0` | With `RUSH_DAEMON_INCREMENTAL_BUILDS`, keep a watch-mode worker (the `<phase>:incremental:ipc` script) alive between daemon builds for each operation whose `rush-project.json` operation settings set `allowDaemonWarmWorker`, and send it the next incremental run. The worker keeps its last build in memory, so it rebuilds only what changed. When an incremental run is not allowed, the worker is closed and the initial script runs, in a new worker if the project defines `<phase>:ipc`. Workers count toward `RUSH_DAEMON_WARM_MEMORY_BUDGET_MB` and `RUSH_DAEMON_WARM_SET_MAX_PROJECTS`. Over either limit the daemon closes them and drops their projects' last results, so raise both for the workers to stay alive. Overrides `warmWorkers`. |
| `RUSH_DAEMON_JOIN_RUNNING_BATCH` | `0` | Experimental. Let a build request that arrives while the daemon executes an incremental batch with the same request settings add its operations to the executing iteration, and get its result once they complete, instead of waiting for the iteration to end. Operations that both requests need run once. If the iteration can't take the request's work, for example because an operation that the request needs started before its inputs changed, the request waits for the iteration to end as before. Overrides `joinRunningBatch`. |
| `RUSH_DAEMON_WARM_IDLE_TIMEOUT_SECONDS` | `300` | Idle expiration for retained runners and project watchers, together with those projects' results. Results of resource-free (shell/null) projects do not expire. Positive seconds, at most 2147483.647. Overrides `warmIdleTimeoutSeconds`. |
| `RUSH_DAEMON_WARM_MEMORY_BUDGET_MB` | `512` | Best-effort sampled RSS budget in MiB. Positive number, at most 9007199254740991. Not a hard process-tree memory ceiling; active/protected work and results of resource-free projects are exempt. Overrides `warmMemoryBudgetMB`. |
| `RUSH_DAEMON_WARM_SET_MAX_PROJECTS` | `20` | Best-effort retained-project limit. Positive safe integer, at most 9007199254740991; never trims the requested execution set. Overrides `warmSetMaxProjects`. |
| `RUSH_DAEMON_AUTO_WARM_BY_TELEMETRY` | `0` | Rank retention using measured time saved, frequency and memory, with conservative LRU fallback. Never speculatively executes scripts. Overrides `autoWarmByTelemetry`. |
| `RUSH_DAEMON_COMPATIBLE_PLUGINS` | empty | Comma-separated `pluginName` values of configured Rush plugins that the repository has verified for long-lived daemon engines, in addition to plugins whose manifest sets `daemonCompatible`. Entries are trimmed; an empty entry is an error, and an empty value lists no plugins. Part of the daemon's environment identity. Overrides `compatiblePlugins`. See [Rush plugins in daemon engines](./dogfooding-rush-daemon.md#rush-plugins-in-daemon-engines). |
| `RUSH_DAEMON_COMMAND_AGNOSTIC_PLUGINS` | empty | Comma-separated `pluginName` values of configured Rush plugins that the repository has verified to be command-agnostic, in addition to plugins whose manifest sets `daemonCommandAgnostic`. Their `runAnyPhasedCommand` taps then don't keep a daemon engine from serving other phased commands. Entries are trimmed; an empty entry is an error, and an empty value lists no plugins. Part of the daemon's environment identity. Overrides `commandAgnosticPlugins`. See [Rush plugins in daemon engines](./dogfooding-rush-daemon.md#rush-plugins-in-daemon-engines). |
| `RUSH_DAEMON_EXPERIMENTAL` | `0` | Enable the experimental `rush-client daemon graph` command surface. Does not start a daemon or enable builds; no corresponding `rush.json` property. |

The timeout maximum is the signed 32-bit millisecond limit used by Node.js `setTimeout`,
expressed in seconds. The other numeric maximum is JavaScript's `Number.MAX_SAFE_INTEGER`.
Warm policies affect footprint and latency, not build correctness.

For example, in PowerShell with a matching daemon-capable Rush release installed:

```powershell
$env:RUSH_DAEMON = "1"
rush-client build --to my-project
rush-client daemon status
rush-client build --no-daemon --to my-project
```

Environment-only opt-in avoids adding a `daemon` block that an older Rush schema cannot parse.
`RUSH_PREVIEW_VERSION` continues to select the requested Rush engine; a matching daemon must
actually be available. A client never relabels its bundled engine to satisfy a different version.

Releases that predate these variables reject unknown `RUSH_` names. While a repository's `rushVersion`
selects such a release, set `RUSH_DAEMON` only for `rush-client` invocations rather than exporting it
to a shell that also runs ordinary `rush`. The [contributor dogfooding guide](./dogfooding-rush-daemon.md)
shows this for the rushstack repository.

See the [client configuration and management reference](../../apps/rush-cli-client/README.md)
for launcher selection, lifecycle commands, persistent-worker restrictions and status fields.

## Reporter selection and verbosity

These are **frontend-owned reporting settings**, not daemon execution controls. The engine
recognizes their names, but the frontend decides their meaning.

| Variable | Current behavior |
| --- | --- |
| `RUSH_REPORTER` | `legacy` (case-insensitive, surrounding whitespace ignored) is the emergency override: it wins over reporter CLI controls and the repository experiment. Other values do not enable or automatically select reporters before the major-version cutover. Use `--reporter=<name>` or `useRushReporter` for opt-in. |
| `RUSH_LOG_LEVEL` | Sets `quiet`, `normal`, `verbose` or `debug` on the opted-in reporter path. Explicit CLI verbosity takes precedence. Does not enable reporters on its own. |
| `RUSH_QUIET_MODE` | Existing compatibility control: `1` or `true` suppresses informational startup output while preserving errors. It remains a quiet alias on the reporter path. |

`RUSH_REPORTER=legacy` changes presentation, whereas `RUSH_DAEMON=0` changes execution routing.
Explicit reporter/output/log-level CLI controls currently retain the native frontend path rather
than being reinterpreted by the daemon's legacy operation renderer.

See [Experimental Rush reporters](reporter.md) for the complete precedence, output ownership,
privacy and rollout contract.
