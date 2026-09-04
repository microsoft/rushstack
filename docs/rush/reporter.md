# Experimental Rush reporters

Rush 5 keeps its existing terminal output by default. The reporter system is a
pre-major, explicit opt-in that can render the same command as an interactive
display, append-only text, machine-readable events, an AI-oriented summary, or
a file-only invocation.

The reporter system currently applies to `rush` commands. It does not consume
`rushx` or `rush-pnpm` arguments; for example, `rush-pnpm --reporter` remains a
PNPM option.

## Opt in and roll back

Choose one of these opt-in scopes:

- **One invocation:** pass an explicit non-legacy reporter, such as
  `rush build --reporter=plaintext`.
- **One repository:** add `"useRushReporter": true` to
  `common/config/rush/experiments.json`.

If neither opt-in is present, Rush uses the legacy output path. The repository
experiment selects `default` for an interactive TTY, `plaintext` for CI or
redirected output, and `file` when a command-specific `--json` option already
owns stdout.

For an immediate reporter rollback, set:

```sh
RUSH_REPORTER=legacy rush build
```

`RUSH_REPORTER=legacy` overrides the repository experiment and reporter CLI
controls. It only changes reporting. It is separate from the Rush daemon's
typed **in-process fallback**, which decides where a command executes when the
daemon cannot satisfy terminal requirements.

Before the planned Rush 6 default change, other `RUSH_REPORTER` values do not
enable reporters. Use `--reporter` or `useRushReporter` instead. Environment
based automatic selection, including automatic `ai` selection, remains
disabled until the evaluation gates in
[#5981](https://github.com/microsoft/rushstack/issues/5981) pass.

`RUSH_PREVIEW_VERSION` participates in the same pre-major safety check. A
preview that matches the bundled Rush frontend can use an explicit reporter,
with the preview warning remaining on stderr. If the preview selects a
different Rush engine version, an explicit non-legacy reporter fails rather
than silently changing the request; repository opt-in falls back to legacy.

## Command-line controls

| Control | Current behavior |
| --- | --- |
| `--reporter=<name>` | Selects `default`, `plaintext`, `json`, `ai`, `file`, or `legacy`. It may be specified once. |
| `--log-level=<level>` | Selects `quiet`, `normal`, `verbose`, or `debug` for the primary reporter. |
| `--quiet` / `-q` | Compatibility alias for reporter log level `quiet`. |
| `--verbose` | Compatibility alias for reporter log level `verbose`. |
| `--debug` / `-d` | Compatibility alias for reporter log level `debug`. |
| `--output=<uri>` | Adds a repeatable file destination. The current rollout accepts `file://` and `json://` URIs with an optional `logLevel` query parameter. |
| Command-specific `--json` | Keeps the command's existing JSON schema. It is not an alias for `--reporter=json`. |

Examples:

```sh
rush build --reporter=plaintext
rush build --reporter=json --log-level=debug
rush build --reporter=plaintext --output=json://./rush-events.jsonl?logLevel=debug
rush list --json --reporter=file
```

Relative `--output` paths are resolved from the invocation working directory.
At this rollout stage, both supported output URI schemes write
privacy-redacted NDJSON event records. A `file://` destination defaults to
`debug`; a `json://` destination inherits the primary log level unless
`?logLevel=` overrides it.

### Precedence and conflicts

1. `RUSH_REPORTER=legacy` is the emergency override and wins over every
   reporter opt-in.
2. An explicit non-legacy `--reporter` selects the primary reporter.
3. Without `--reporter`, `useRushReporter` selects a TTY/CI-aware primary
   reporter.
4. Without either opt-in, the legacy output remains authoritative.

Explicit CLI verbosity takes precedence over `RUSH_LOG_LEVEL`.
`RUSH_QUIET_MODE=1` and `RUSH_QUIET_MODE=true` remain quiet aliases.
Different explicit verbosity levels are rejected; for example,
`--quiet --debug` is invalid on the reporter path. `--log-level` itself may be
specified only once. Equivalent controls such as `--quiet --log-level=quiet`
are allowed. The frontend scans reporter controls until a standalone `--`;
arguments after that separator belong to the invoked command. The short `-v`
flag is not a reporter verbosity alias because existing Rush commands retain
their established `-v` meanings.

`--output` and `--log-level` require an explicit non-legacy `--reporter` or the
repository experiment. They are not supported with `--reporter=legacy`.
Each resolved `--output` destination must be unique. Two sidecars cannot own
the same path, even when one uses `file://` and the other uses `json://`.

A command-specific `--json` option owns stdout. It can be combined with
`--reporter=file`, which leaves stdout to the command and prints the full-log
path on stderr. Combining it with `--reporter=json`, `--reporter=ai`,
`--reporter=plaintext`, or `--reporter=default` is rejected.

Rush help remains on the legacy parser-only path, even if reporter controls are
present.

## Built-in reporters and stream ownership

| Reporter | Intended use | Output contract |
| --- | --- | --- |
| `default` | Interactive terminal | Owns stdout. Requires a TTY. Renders a width-aware three-row live region, restores the cursor, and leaves a bounded final summary. |
| `plaintext` | CI, redirected output, or a stable human-readable transcript | Owns stdout. Append-only, no cursor movement, and color disabled. Explicit selection and recognized CI use project-by-phase output groups; repository opt-in on another non-TTY uses a concise status form. |
| `json` | General automation | Owns stdout with one versioned event envelope per NDJSON line for each event admitted by the selected log level. Use `--log-level=debug` for the full event stream. It emits no terminal control sequences. |
| `ai` | Bounded agent consumption | Owns stdout with an `ai.status` record and a bounded `ai.final` record. The final record includes result, counts, diagnostics, optional structured remediation, and the completed full-log reference. |
| `file` | Preserve command stdout for another schema or suppress primary terminal rendering | Writes no stdout. The automatic full-detail log is created and its absolute path is printed to stderr. |
| `legacy` | Compatibility and emergency rollback | Uses the existing Rush output path and does not enable the new reporter operation stream. |

The `default` reporter uses the current terminal width, truncates long rows with
an ellipsis, and summarizes additional active projects as `+N more`. Color
follows TTY capability. `NO_COLOR` disables it, and `FORCE_COLOR` enables it
unless its value is `0` or `false`.

Reporter operation names are **project x phase**, not just project names. For
example, the build operation for this package has the stable identity
`@rushstack/rush-reporter#_phase:build` and a human header such as:

```text
==[ @rushstack/rush-reporter (_phase:build) ]==
```

This distinction matters when one project participates in multiple phases.

### Watch iterations

In watch mode, the same project-by-phase operation can execute more than once.
Lifecycle and output events therefore carry a graph `iterationId` in their
payload. The built-in default, plaintext, AI, and file reporters use
`iterationId` together with the operation ID so overlapping scheduled
iterations cannot mix output, diagnostics, or totals.

Each watch summary reports only that iteration's completed and total operations.
The AI final record likewise uses one recovered iteration scope for counts,
failed projects, diagnostics, and errors rather than combining a failed cycle
with a later successful cycle.

## Full-detail logs and privacy

Every enabled reporter invocation attempts to create:

```text
<rush-temp-folder>/rush-logs/<UTC timestamp>-<pid>-<action>.log
```

The Rush temp folder is normally `<repo>/common/temp`. If `RUSH_TEMP_FOLDER` is
set, Rush applies its normal path resolution and uses that same folder for
reporter logs and purge behavior.

`<rush-temp-folder>/rush-logs/latest.log` points to, or copies, the current or
latest successfully opened invocation log. It can be incomplete while Rush is
still running; after the command exits, it contains the finalized log when
logging succeeded. When a new log is opened, logs older than 14 days are
removed and the location is capped at 20 sessions.

`rush purge` removes the active Rush temp folder, including its `rush-logs`
directory. A reporter-enabled purge writes that purge invocation's own log to
the owner-only OS-temp fallback instead, so it does not recreate the directory
that it just removed.

On platforms that support POSIX permissions, invocation logs and operation
spool files use mode `0600`. If the repository path cannot be used, Rush falls
back to an owner-only `rush-logs-<user>` directory under the OS temp folder. If
both locations fail, Rush emits a one-line warning on stderr and continues the
command without a log artifact.

Structured values classified as `secret` are redacted from JSON and full-detail
logs. `local-sensitive` values, including absolute paths, remain in local
outputs. Raw child stdout/stderr is preserved in the full log and cannot be
reliably redacted, so treat the log as sensitive local build output.

> **Prerequisite:** The detailed telemetry projection described below is
> implemented and reviewed in
> [#5990](https://github.com/microsoft/rushstack/pull/5990).

Reporter telemetry is a bounded allowlist projection, not a serialized reporter
event stream. Envelope metadata, lifecycle values, protocol ownership, and
producer identity are collected only from effectively public events. A
diagnostic with any non-public parameter is treated as non-public even when its
envelope floor is `public`.

For a non-public diagnostic, telemetry may retain only a centrally registered
diagnostic code and that code's registry category. It does not retain the
diagnostic parameters, remediation, templates, source, message text, or
producer identity. Messages, paths, raw stdout/stderr, command arguments,
artifacts, extension payloads, remediation parameters, stack traces, and other
`local-sensitive` or `secret` values are excluded. Diagnostic and producer
dimensions have deterministic count and string-length budgets, with trusted
registered or parent-session values prioritized.

## Agent environment configuration

Repositories can declare additional agent markers in `rush.json`:

```json
{
  "reporting": {
    "agentEnvironmentVariables": ["MY_AGENT_CLI", "ANOTHER_AGENT"]
  }
}
```

`COPILOT_CLI` is the built-in marker and does not need to be listed. A marker is
considered active when it is defined and is not an empty string, `0`, `false`,
`no`, or `off`, ignoring case.

This configuration is available to the reporter selection API, but the current
Rush 5 frontend deliberately does not automatically select `ai` from these
variables. Until [#5981](https://github.com/microsoft/rushstack/issues/5981)
lands and its gates pass, select `--reporter=ai` explicitly.

## Bootstrap and cross-version behavior

> **Prerequisite:** The behavior in this section is implemented by
> [#5993](https://github.com/microsoft/rushstack/pull/5993). It is not provided
> by the direct-invocation demo branch alone.

A direct `rush` invocation starts in the Rush frontend and does not create a
bootstrap handoff file.

After #5993 lands, `common/scripts/install-run-rush.js` and generated
`install-run-rush` launchers parse the early reporter opt-in before installing
or loading the repository's Rush version. Startup and inherited package-manager
output are buffered into an owner-only, nonce-authenticated NDJSON handoff in
the OS temp folder. The installed frontend replays the records in order, deletes
the handoff, clears its private environment variables, and sweeps abandoned
handoffs older than 14 days.

The handoff buffer is limited to 1 MiB and raw output chunks to 64 KiB.
Replaceable status updates can be dropped with a truncation marker. If required
output cannot be preserved, bootstrap fails rather than presenting incomplete
output as successful.

The bootstrap does not publish the working directory or full command arguments
as public events. Ordinary status can be public, while messages containing
lockfile, npmrc, installation, or other filesystem paths are classified
`local-sensitive`. Raw package-manager output is also `local-sensitive`.
Capture corruption or a partial final record produces one local-sensitive
warning on stderr, is omitted from required handoff accounting, and does not
replace the real install result. Machine reporter stdout remains payload-only
on bootstrap failure.

Compatibility is intentionally asymmetric:

- An **explicit** reporter request fails with an update-or-use-legacy message
  when the installed frontend or bootstrap protocol cannot satisfy it.
- An **implicit** repository opt-in falls back to legacy output when the
  installed version or protocol is incompatible.
- The current direct frontend also rejects an explicit non-legacy reporter when
  version selection chooses a different engine, because it cannot verify that
  engine's reporter close contract. It does not strip the option or pretend the
  request succeeded.
- The #5993 new-frontend/old-engine adapter is a lower-level compatibility
  primitive: when such a pairing is allowed, it preserves the old engine's
  stdout/stderr ordering and mirrors the output into the host. Machine reporter
  stdout stays payload-only, so old-engine stdout is visible on stderr instead.
- An old frontend loading a new engine receives legacy engine rendering because
  it cannot supply a structured sink.

These compatibility fallbacks concern frontend/engine or bootstrap version
skew. They are different from both `RUSH_REPORTER=legacy` and the daemon's
in-process execution fallback.

## Reproduce the repository demo

From a clean Rush Stack checkout:

```sh
node common/scripts/install-run-rush.js install
node common/scripts/install-run-rush.js build --to @microsoft/rush
node apps/rush/src/test/sandbox/reporter-demo/run.mjs
```

The self-checking script prints a temporary output directory and the full-detail
log path. It exercises the legacy baseline, detailed plaintext, JSON, AI, file,
quiet, rollback, parser failure, help, explicit sidecar output, and
command-specific JSON ownership. It removes inherited `RUSH_REPORTER`,
`RUSH_LOG_LEVEL`, and `RUSH_QUIET_MODE` values so those controls do not change
the matrix. It also runs `rush purge` against an isolated `RUSH_TEMP_FOLDER` to
verify cleanup. Because `rush purge` unlinks project dependencies, run the
install command again before continuing development in this checkout.

The following individual commands are useful when reviewing each shape:

```sh
# Legacy baseline: unchanged when no opt-in is present
node apps/rush/bin/rush build --only @rushstack/rush-reporter

# Compact interactive reporter; run directly in a TTY
node apps/rush/bin/rush build --only @rushstack/rush-reporter --reporter=default

# Append-only project-by-phase groups
node apps/rush/bin/rush build --only @rushstack/rush-reporter --reporter=plaintext

# Payload-only NDJSON on stdout
node apps/rush/bin/rush build --only @rushstack/rush-reporter --reporter=json --log-level=debug

# Preview the bundled frontend version without contaminating JSON stdout
RUSH_PREVIEW_VERSION=$(node -p "require('./apps/rush/package.json').version") node apps/rush/bin/rush build --only @rushstack/rush-reporter --reporter=json

# Bounded AI failure record; this command intentionally exits with code 1
node apps/rush/bin/rush build --only @rushstack/does-not-exist --reporter=ai

# No stdout; the generated full-log path is written to stderr
node apps/rush/bin/rush build --only @rushstack/rush-reporter --reporter=file

# Put logs under a normalized Rush temp override
RUSH_TEMP_FOLDER=./common/temp/reporter-demo-override node apps/rush/bin/rush build --only @rushstack/rush-reporter --reporter=file

# Final result and log path without operation output
node apps/rush/bin/rush --quiet build --only @rushstack/rush-reporter --reporter=plaintext

# Emergency rollback, even though a different reporter was requested
RUSH_REPORTER=legacy node apps/rush/bin/rush build --only @rushstack/rush-reporter --reporter=json
```

Expected shapes, rather than exact transcripts:

- Legacy starts with the Rush banner and uses the existing numbered operation
  blocks and final status sections.
- `default` maintains up to three live rows, then leaves a short success or
  failure summary and log path.
- Explicit `plaintext` prints a `project (phase)` group, its ordered output, the
  terminal operation status, the command result, and `Full log: <absolute path>`.
- `json --log-level=debug` prints only NDJSON event envelopes. Final records include
  `artifactAvailable`, `commandResult`, `commandCompleted`, and
  `sessionCompleted`.
- A matching `RUSH_PREVIEW_VERSION` leaves JSON stdout parseable and writes the
  preview warning to stderr.
- `ai` prints an `ai.status` record and an `ai.final` record. The intentional
  missing-project failure includes an actionable diagnostic summary and a
  complete log reference. When a producer supplies structured remediation, it
  appears in `diagnostics[].remediation`; the missing-project parser example
  does not currently supply a remediation action.
- `file` leaves stdout empty and prints `Rush full log: <absolute path>` on
  stderr.
- `RUSH_TEMP_FOLDER` moves the log under that folder's `rush-logs` directory.
  A subsequent reporter-enabled `rush purge` removes the override and preserves
  its own purge log in OS temp.
- `quiet` suppresses grouped operation output but preserves the final result and
  log location.
- Rollback matches the feature-off transcript after normalizing run durations.
- Watch summaries identify one graph iteration and report per-iteration totals,
  even when scheduling overlaps the prior cycle's completion.

Inspect the latest full log with:

```sh
ls -lt common/temp/rush-logs
sed -n '1,120p' common/temp/rush-logs/latest.log
```

The log combines privacy-redacted event metadata with raw operation output
grouped by project and phase.

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| `--reporter=default requires an interactive TTY` | Use `--reporter=plaintext` in CI, a pipe, or redirected output. |
| `--output` or `--log-level` requires an opt-in | Add an explicit non-legacy `--reporter`, or enable `useRushReporter`. |
| A destination is already owned by another reporter | Give each repeatable `--output` sidecar a different resolved path. URI scheme differences do not permit sharing one path. |
| Command-specific `--json` owns stdout | Use `--reporter=file` or omit the reporter. Do not combine it with a stdout reporter. |
| `RUSH_REPORTER=<non-legacy>` cannot enable the pre-major path | Use `--reporter=<name>`. Only `RUSH_REPORTER=legacy` is active before the auto-selection gates pass. |
| The full-detail log cannot be written | Check the stderr warning and permissions for the active `<rush-temp-folder>/rush-logs` and the OS temp directory. The Rush command itself continues. |
| Logs are not under `common/temp` | Check `RUSH_TEMP_FOLDER`; reporter logs follow the same normalized override used by Rush and `rush purge`. |
| An explicit reporter fails across Rush versions | Use the Rush version bundled with the frontend, update the global/bootstrap and repository versions together, or use `--reporter=legacy`. The bootstrap-specific checks land with #5993. |
| Repository opt-in falls back to legacy across versions | This is the safe implicit compatibility behavior from #5993, not a daemon fallback. |

## Current limitations

- Public reporter controls apply to `rush`, not `rushx` or `rush-pnpm`.
- Additional `--output` destinations are limited to `file://` and `json://`,
  and both currently write NDJSON.
- Third-party reporter loading remains deferred.
- The exported `regroupOperationOutput()` convenience helper groups by
  operation ID only. A third-party watch reporter using it directly must first
  partition events by `iterationId`; the built-in reporters already isolate
  iterations.
- The bounded telemetry aggregate does not currently expose a truncation
  indicator when a diagnostic or producer dimension reaches its budget.
- Automatic agent and AI selection remains disabled until #5981 passes.

## Rush 6 safety boundary

The planned Rush 6 migration may enable environment-based reporter selection by
default, align reporter ownership with daemon clients, gate incompatible
plugins, and remove legacy terminal APIs. None of those defaults are enabled by
this opt-in guide.

The Rush 6 change remains gated on the bootstrap/cross-version work in
[#5993](https://github.com/microsoft/rushstack/pull/5993), the agent
auto-selection qualification in
[#5981](https://github.com/microsoft/rushstack/issues/5981), and the coordinated
migration work in [#5982](https://github.com/microsoft/rushstack/issues/5982).
The legacy renderer and `RUSH_REPORTER=legacy` rollback are planned to remain
available for at least that major.
