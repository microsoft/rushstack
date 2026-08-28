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
are allowed. The compatibility aliases are global Rush options and must precede
the command name; for example, `rush --quiet build --reporter=plaintext`. The
short `-v` flag is not a reporter verbosity alias because existing Rush commands
retain their established `-v` meanings.

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
| `json` | General automation | Owns stdout with one versioned event envelope per NDJSON line. It emits no terminal control sequences. |
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

## Full-detail logs and privacy

Every enabled reporter invocation attempts to create:

```text
<repo>/common/temp/rush-logs/<UTC timestamp>-<pid>-<action>.log
```

`common/temp/rush-logs/latest.log` points to, or copies, the current or latest
successfully opened invocation log. It can be incomplete while Rush is still
running; after the command exits, it contains the finalized log when logging
succeeded. Logs older than 14 days are removed and each location retains at
most 20 sessions. `rush purge` removes the repository log directory.

On platforms that support POSIX permissions, invocation logs and operation
spool files use mode `0600`. If the repository path cannot be used, Rush falls
back to an owner-only `rush-logs-<user>` directory under the OS temp folder. If
both locations fail, Rush emits a one-line warning on stderr and continues the
command without a log artifact.

Structured values classified as `secret` are redacted from JSON and full-detail
logs. `local-sensitive` values, including absolute paths, remain in local
outputs. Raw child stdout/stderr is preserved in the full log and cannot be
reliably redacted, so treat the log as sensitive local build output.

Reporter telemetry is allowlist-only. It excludes messages, paths, raw
stdout/stderr, command arguments, remediation parameters, stack traces, and all
`local-sensitive` or `secret` values.

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

Compatibility is intentionally asymmetric:

- An **explicit** reporter request fails with an update-or-use-legacy message
  when the installed frontend or reporter protocol cannot satisfy it.
- An **implicit** repository opt-in falls back to legacy output when the
  installed version or protocol is incompatible.
- A new frontend loading an old engine keeps the old engine's legacy output
  visible while adapting it into the host.
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
the matrix.

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

# Bounded AI failure record; this command intentionally exits with code 1
node apps/rush/bin/rush build --only @rushstack/does-not-exist --reporter=ai

# No stdout; the generated full-log path is written to stderr
node apps/rush/bin/rush build --only @rushstack/rush-reporter --reporter=file

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
- `json` prints only NDJSON event envelopes. Final records include
  `artifactAvailable`, `commandResult`, `commandCompleted`, and
  `sessionCompleted`.
- `ai` prints an `ai.status` record and an `ai.final` record. The intentional
  missing-project failure includes an actionable diagnostic summary and a
  complete log reference. When a producer supplies structured remediation, it
  appears in `diagnostics[].remediation`; the missing-project parser example
  does not currently supply a remediation action.
- `file` leaves stdout empty and prints `Rush full log: <absolute path>` on
  stderr.
- `quiet` suppresses grouped operation output but preserves the final result and
  log location.
- Rollback matches the feature-off transcript after normalizing run durations.

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
| The full-detail log cannot be written | Check the stderr warning and permissions for `common/temp/rush-logs` and the OS temp directory. The Rush command itself continues. |
| An explicit reporter fails across Rush versions | Update the global/bootstrap and repository Rush versions to compatible reporter protocol implementations, or use `--reporter=legacy`. This behavior lands with #5993. |
| Repository opt-in falls back to legacy across versions | This is the safe implicit compatibility behavior from #5993, not a daemon fallback. |

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
