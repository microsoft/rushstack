---
date: 2026-07-12 14:11:07 UTC
researcher: Sean Larkin
git_commit: 012bae77ba8dd013d8bcd806b55d05c8001e5d92
branch: main
repository: rushstack
topic: "Current Rush startup and terminal output pipeline for GitHub issue #5858"
tags: [research, codebase, rush, terminal, stream-collator]
status: complete
last_updated: 2026-07-12
last_updated_by: Sean Larkin
last_updated_note: "Added design review constraints for bootstrap, compatibility, and CI output"
---

# Research

## Research Question

How does a current Rush invocation produce and route terminal output from the
`install-run-rush` shim through the selected `rush-lib`, command-line parsing,
phased execution, and per-project streams?

## Summary

A managed Rush invocation can cross three independently reporting layers:

1. `install-run-rush` locates and installs the requested `@microsoft/rush`
   package, then launches its binary with inherited stdio.
2. The `@microsoft/rush` frontend selects the `rush-lib` version requested by
   `rush.json`.
3. The selected `rush-lib` parses the command and, for phased commands, routes
   project output through terminal transforms, project logs, and
   `StreamCollator`.

Output is produced through both direct `console.*` calls and
`@rushstack/terminal`. Global `--quiet`, phased `--verbose`, and global
`--debug` control different parts of this flow. Current Rush has no global
`--reporter`, `--log-level`, `COPILOT_CLI`, or `RUSH_REPORTER` handling.

## Detailed Findings

### Bootstrap and version installation

The source for the checked-in bootstrap script is
[`install-run-rush.ts`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/scripts/install-run-rush.ts#L23-L125).
It derives `rush`, `rushx`, or `rush-pnpm` from the wrapper filename, reads the
requested Rush version, and delegates package installation and process launch
to
[`install-run.ts`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/scripts/install-run.ts#L439-L527).

Bootstrap quiet mode is enabled by `RUSH_QUIET_MODE=1`, `true`, `-q`, or
`--quiet`. It suppresses informational logger calls, but not usage text, npm
output inherited by the install process, invoked Rush output, or errors
([`install-run-rush.ts:77-123`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/scripts/install-run-rush.ts#L77-L123)).

### Frontend and selected `rush-lib`

[`apps/rush/src/start.ts`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/apps/rush/src/start.ts#L36-L105)
loads the minimal Rush configuration, handles preview-version output, and
chooses the bundled or requested engine. A different requested version is
installed and loaded by
[`RushVersionSelector`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/apps/rush/src/RushVersionSelector.ts#L26-L102).

[`RushCommandSelector.execute()`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/apps/rush/src/RushCommandSelector.ts#L28-L64)
dispatches to `Rush.launch()`, `Rush.launchRushX()`, or
`Rush.launchRushPnpm()` on the selected library. From that point, command
behavior belongs to the selected `rush-lib`, which may differ from the
frontend's bundled version.

### Parser startup and banner suppression

[`Rush.launch()`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/api/Rush.ts#L79-L100)
prints the startup banner and constructs `RushCommandLineParser`.
[`RushStartupBanner`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/RushStartupBanner.ts#L9-L44)
uses direct stdout output.

[`shouldRestrictConsoleOutput()`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/RushCommandLineParser.ts#L209-L231)
suppresses startup information for tab completion, `-q`, `--quiet`, any
`--json`, or `RUSH_QUIET_MODE`. It gates the banner, configuration-discovery
messages, and the base action's `Starting "rush <action>"` line. It does not
silence action output or phased-operation output.

The parser currently defines global `--debug` and `--quiet`
([`RushCommandLineParser.ts:99-124`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/RushCommandLineParser.ts#L99-L124)).
Phased `--verbose` is defined separately
([`PhasedScriptAction.ts:257-261`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/scriptActions/PhasedScriptAction.ts#L257-L261)).

### Distinct output controls

- Global `--quiet` suppresses startup information.
- Phased `--verbose` controls whether project stdout is shown live.
- Global `--debug` enables verbose/debug terminal channels and stack output.
- `--json` is action-specific for commands such as `list`, `scan`, and
  `check`; the parser recognizes its presence only to suppress ancillary
  startup output.

For phased execution, `isQuietMode` is computed as the inverse of
`--verbose`
([`PhasedScriptAction.ts:468-471`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/scriptActions/PhasedScriptAction.ts#L468-L471)).
This phased quiet mode is independent of the global `--quiet` flag.

### Terminal severity and stream routing

[`Terminal`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/terminal/src/Terminal.ts#L14-L187)
broadcasts writes to registered providers and strips ANSI codes for providers
without color support.
[`ConsoleTerminalProvider`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/terminal/src/ConsoleTerminalProvider.ts#L35-L89)
routes log, verbose, and debug output to stdout and warning/error output to
stderr.

Terminal chunks preserve only stream identity and text:
[`ITerminalChunk`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/terminal/src/ITerminalChunk.ts#L8-L50)
uses `Stdout` (`"O"`) and `Stderr` (`"E"`).

### Per-operation output graph

[`OperationExecutionRecord.runWithTerminalAsync()`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/operations/OperationExecutionRecord.ts#L293-L385)
constructs this graph:

```text
normalized operation output
 ├─ quiet filter or collated console writer
 └─ stderr line classifier
      ├─ project logs
      ├─ bounded stdio summary
      └─ color removal → problem collector
```

Without phased `--verbose`,
[`DiscardStdoutTransform`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/terminal/src/DiscardStdoutTransform.ts#L60-L101)
removes live stdout while preserving stderr. Project logs, failure summaries,
and problem collection still receive both channels.

### Stream collation

[`StreamCollator`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/stream-collator/src/StreamCollator.ts#L39-L198)
keeps one writer active and buffers inactive writers so parallel projects do
not interleave. Its activation callback is used by
[`OperationExecutionManager`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/operations/OperationExecutionManager.ts#L131-L235)
to print operation headers and `N of total` progress.

### TTY and color

Color support is delegated to `supports-color` by
[`ConsoleTerminalProvider`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/terminal/src/ConsoleTerminalProvider.ts#L35-L51).
The normal phased output path does not select a different layout based on TTY.
TTY checks are used for specific behaviors such as watch-mode keyboard input
([`PhasedScriptAction.ts:865-868`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/scriptActions/PhasedScriptAction.ts#L865-L868))
and pnpm reporter selection
([`WorkspaceInstallManager.ts:863-880`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/installManager/WorkspaceInstallManager.ts#L863-L880)).

## Code References

- `libraries/rush-lib/src/scripts/install-run-rush.ts:23-125` - Bootstrap selection and quiet behavior.
- `apps/rush/src/start.ts:36-105` - Frontend version selection.
- `libraries/rush-lib/src/cli/RushCommandLineParser.ts:99-246` - Global parameters and startup restriction.
- `libraries/rush-lib/src/cli/scriptActions/PhasedScriptAction.ts:218-471` - Phased output parameters.
- `libraries/rush-lib/src/logic/operations/OperationExecutionRecord.ts:293-385` - Per-operation output graph.
- `libraries/stream-collator/src/StreamCollator.ts:39-198` - Parallel stream buffering.

## Architecture Documentation

The current architecture separates bootstrap, frontend version selection, and
selected-engine reporting. Within phased execution, terminal providers express
severity, terminal chunks express stdout/stderr identity, transforms fan out
and normalize output, and `StreamCollator` serializes parallel project output.

## Historical Context

Historical research described `@microsoft/rush` as the CLI frontend,
`@microsoft/rush-lib` as the implementation/API package, and
`@rushstack/terminal` as the output abstraction:
[`research/docs/2026-02-07-rushstack-architecture-and-build-systems.md`](https://github.com/microsoft/rushstack/blob/311a90ee4d57eb3ddfe05bf965c01b94fa879dbf/research/docs/2026-02-07-rushstack-architecture-and-build-systems.md).

## Related Research

- [Rush operation reporting](./2026-07-12-rush-operation-reporting.md)
- [Rush reporting patterns](./2026-07-12-rush-reporting-patterns.md)
- [Issue #5858 synthesis](../tickets/2026-07-12-5858-rush-reporter-overhaul.md)

## Open Questions

- **Cross-version events — partially answered:** Reporter initialization begins
  in the global version-selector or `install-run-rush` layer. An unknown event
  from a newer repository engine may produce a diagnostic asking the user to
  update global Rush. The event protocol and version negotiation remain
  undefined.
- **CI selection — partially answered:** A StreamCollator-like detailed
  reporter remains available for CI/log browsing, and CI-specific formats are
  valid reporter implementations. Automatic CI detection and reporter
  selection rules remain undefined.

See
[the design review note](../notes/2026-07-12-rush-reporter-design-review.md)
for timestamped meeting evidence.
