---
date: 2026-07-12 14:11:07 UTC
researcher: Sean Larkin
git_commit: 012bae77ba8dd013d8bcd806b55d05c8001e5d92
branch: main
repository: rushstack
topic: "Existing Rush Stack reporting, serialization, Heft, and localization patterns for GitHub issue #5858"
tags: [research, codebase, rush, heft, reporters, localization]
status: complete
last_updated: 2026-07-12
last_updated_by: Sean Larkin
last_updated_note: "Added design review scope for localization and output baselines"
---

# Research

## Research Question

Which existing Rush Stack abstractions and implementations already express
provider selection, output fan-out, reporter injection, machine-readable
output, localization, progress, and output test contracts?

## Summary

The repository contains several reporter-adjacent patterns, but no Rush-wide
reporter contract. `@rushstack/terminal` provides provider strategy and
transform graphs; Rush project logs serialize terminal chunks as JSONL; Heft
aggregates scoped loggers and injects a custom Jest reporter; several commands
emit typed JSON; localization utilities parse external string resources; and
snapshots encode current output behavior.

## Detailed Findings

### Terminal provider strategy and fan-out

[`ITerminalProvider`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/terminal/src/ITerminalProvider.ts#L22-L59)
is a strategy interface with color/newline capabilities and a severity-aware
`write()` method. `Terminal` broadcasts each write to all providers
([`Terminal.ts:14-33`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/terminal/src/Terminal.ts#L14-L33)).

Existing provider adapters include:

- [`ConsoleTerminalProvider`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/terminal/src/ConsoleTerminalProvider.ts#L35-L97) for stdout/stderr;
- [`PrefixProxyTerminalProvider`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/terminal/src/PrefixProxyTerminalProvider.ts#L56-L116) for line prefixes;
- [`StringBufferTerminalProvider`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/terminal/src/StringBufferTerminalProvider.ts#L85-L153) for capture and tests;
- [`NoOpTerminalProvider`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/terminal/src/NoOpTerminalProvider.ts#L13-L31) for discarded output.

[`SplitterTransform`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/terminal/src/SplitterTransform.ts#L19-L97)
fans the same immutable terminal chunk out to multiple writable destinations.

### Machine-preserving logs

[`JsonLFileWritable`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/operations/ProjectLogWritable.ts#L68-L132)
serializes each `{ kind, text }` terminal chunk as one JSON line. Text and
stderr-only logs are produced in parallel by `SplitLogFileWritable`.

[`OperationMetadataManager`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/operations/OperationMetadataManager.ts#L152-L173)
can replay JSONL chunks with original stdout/stderr classification and falls
back to a merged text log when chunk metadata is absent.

### Heft scoped logging

[`LoggingManager`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/apps/heft/src/pluginFramework/logging/LoggingManager.ts#L16-L103)
owns Heft's scoped loggers, tracks warnings/errors, resets state between runs,
and aggregates messages. Each
[`ScopedLogger`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/apps/heft/src/pluginFramework/logging/ScopedLogger.ts#L59-L135)
uses a prefixing provider and stores emitted errors.

[`HeftActionRunner.runWithLoggingAsync()`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/apps/heft/src/cli/HeftActionRunner.ts#L121-L197)
prints a final result and repeats aggregated warning/error summaries.

### Reporter injection in the Heft Jest plugin

[`HeftJestReporter`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/heft-plugins/heft-jest-plugin/src/HeftJestReporter.ts#L37-L248)
implements Jest's reporter interface and renders suite, test, console, failure,
snapshot, and aggregate results through a Heft scoped logger.

[`JestPlugin`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/heft-plugins/heft-jest-plugin/src/JestPlugin.ts#L827-L891)
replaces Jest's `"default"` reporter entry with `HeftJestReporter`, installs it
when no reporter is configured, and preserves configured third-party
reporters. `--debug-heft-reporter` leaves Jest's reporter behavior active.

### Other message interception

API Extractor exposes a message callback whose mutable message can be marked
handled or assigned another log level
([`ExtractorMessage.ts:157-204`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/apps/api-extractor/src/api/ExtractorMessage.ts#L157-L204)).
The Heft API Extractor plugin maps those messages into Heft logger severities
and marks them handled
([`ApiExtractorRunner.ts:78-139`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/heft-plugins/heft-api-extractor-plugin/src/ApiExtractorRunner.ts#L78-L139)).

### Machine-readable command output

Rush currently provides command-specific JSON:

- [`rush list --json`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/actions/ListAction.ts#L128-L188);
- [`rush scan --json`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/actions/ScanAction.ts#L204-L212);
- [`rush check --json`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/actions/CheckAction.ts#L31-L82).

Rush also consumes machine formats:

- Git porcelain v2 through
  [`Git.ts`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/Git.ts#L433-L444);
- pnpm NDJSON reporting through
  [`BaseInstallManager`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/base/BaseInstallManager.ts#L895-L901);
- SARIF output in the Heft lint plugin through
  [`SarifFormatter`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/heft-plugins/heft-lint-plugin/src/SarifFormatter.ts#L11-L230).

### Localization infrastructure

[`@rushstack/localization-utilities`](https://github.com/microsoft/rushstack/tree/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/localization-utilities)
models localized entries as `{ value, comment? }` and parses `.resx`,
`.loc.json`, `.resx.json`, and `.resjson`.
[`parseLocFile()`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/localization-utilities/src/LocFileParser.ts#L12-L86)
selects and caches parsers, while
[`parseLocJson()`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/localization-utilities/src/parsers/parseLocJson.ts#L9-L33)
validates and normalizes entries.

### Progress and output contracts

Current Rush progress is the operation activation header produced by
[`OperationExecutionManager`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/operations/OperationExecutionManager.ts#L203-L233).
Watch mode separately rewrites persistent status lines through Node's
`readline` cursor APIs
([`ProjectWatcher.ts:432-447`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/ProjectWatcher.ts#L432-L447)).

Output behavior is encoded in snapshots and focused tests for:

- Rush operation execution and cobuild output;
- terminal severity, color, and chunks;
- splitter fan-out;
- bounded stdio summaries;
- operation metadata replay;
- Heft operation-graph output.

## Code References

- `libraries/terminal/src/ITerminalProvider.ts:22-59` - Provider strategy.
- `libraries/terminal/src/SplitterTransform.ts:19-97` - Output fan-out.
- `libraries/rush-lib/src/logic/operations/ProjectLogWritable.ts:68-241` - Text and JSONL project logs.
- `apps/heft/src/pluginFramework/logging/LoggingManager.ts:16-103` - Heft logger aggregation.
- `heft-plugins/heft-jest-plugin/src/JestPlugin.ts:827-891` - Reporter replacement/injection.
- `libraries/localization-utilities/src/LocFileParser.ts:12-86` - String resource parsing.

## Architecture Documentation

Existing patterns separate message creation from transport in several local
contexts: terminal providers, terminal transforms, API Extractor callbacks,
Heft scoped loggers, and Jest reporter injection. These contracts are scoped
to their packages and are not currently unified as a Rush session reporter.

## Historical Context

A historical draft for the interactive upgrade UI documented proposed TTY and
CI rendering tiers and cited GitHub Copilot CLI as an Ink adopter, but it did
not define a Copilot or reporter integration:
[`research/specs/2026-01-23-interactive-upgrade-ui-rewrite.md`](https://github.com/microsoft/rushstack/blob/daada7cfa94ab0b3eaeca355706ba95f876fceb4/research/specs/2026-01-23-interactive-upgrade-ui-rewrite.md).

Historical implementation research later recorded that the interactive command
still used Inquirer and had no CI-specific fallback:
[`research/docs/2026-02-07-upgrade-interactive-implementation.md`](https://github.com/microsoft/rushstack/blob/311a90ee4d57eb3ddfe05bf965c01b94fa879dbf/research/docs/2026-02-07-upgrade-interactive-implementation.md).

## Related Research

- [Rush output pipeline](./2026-07-12-rush-output-pipeline.md)
- [Rush operation reporting](./2026-07-12-rush-operation-reporting.md)
- [Issue #5858 synthesis](../tickets/2026-07-12-5858-rush-reporter-overhaul.md)

## Open Questions

- **Localization — partially answered:** Translated locales are outside this
  work. The reporter architecture may support later localization, but the
  meeting did not define string externalization.
- **Output snapshots — unresolved:** The meeting did not discuss testing or
  snapshot migration for the current fixed renderers.

See
[the design review note](../notes/2026-07-12-rush-reporter-design-review.md)
for timestamped meeting evidence.
