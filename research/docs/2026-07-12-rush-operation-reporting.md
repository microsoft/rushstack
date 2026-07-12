---
date: 2026-07-12 14:11:07 UTC
researcher: Sean Larkin
git_commit: 012bae77ba8dd013d8bcd806b55d05c8001e5d92
branch: main
repository: rushstack
topic: "Current Rush phased operation reporting, errors, and telemetry for GitHub issue #5858"
tags: [research, codebase, rush, operations, errors, telemetry]
status: complete
last_updated: 2026-07-12
last_updated_by: Sean Larkin
last_updated_note: "Added design review constraints for telemetry and structured errors"
---

# Research

## Research Question

How do current phased Rush commands expose operation status, render summaries,
propagate errors, set exit codes, publish plugin hooks, and record telemetry?

## Summary

Phased reporting is distributed across the operation scheduler and records,
terminal pipelines, fixed completion plugins, `AlreadyReportedError`,
top-level parser handling, and a separate telemetry path. Operations emit
`OperationStatus` transitions through `PhasedCommandHooks`; built-in timeline
and result-summary plugins render after execution; unsuccessful commands throw
an already-rendered sentinel; and `RushCommandLineParser` owns final exit-code
and telemetry-drain behavior.

## Detailed Findings

### Session and plugin registration

[`RushCommandLineParser`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/RushCommandLineParser.ts#L126-L168)
creates one `ConsoleTerminalProvider`, `RushSession`, and `PluginManager`.
Plugins implement
[`IRushPlugin.apply()`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/pluginFramework/IRushPlugin.ts#L7-L12)
and receive the shared session and Rush configuration.

[`RushSession.getLogger()`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/pluginFramework/RushSession.ts#L52-L68)
creates scoped `Logger` instances over the parser's shared terminal provider.
The current
[`ILogger`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/pluginFramework/logging/Logger.ts#L9-L77)
surface consists of a `Terminal`, `emitError()`, and `emitWarning()`.

### Phased hook lifecycle

Each `PhasedScriptAction` owns
[`PhasedCommandHooks`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/pluginFramework/PhasedCommandHooks.ts#L146-L215).
The current hooks cover:

- operation graph creation;
- before-all, before-operation, and after-operation execution;
- operation status changes;
- operation environment creation;
- after-all execution;
- watch shutdown and waiting notifications;
- telemetry mutation through `beforeLog`.

The action wires these hooks into the execution manager at
[`PhasedScriptAction.ts:595-616`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/scriptActions/PhasedScriptAction.ts#L595-L616)
and invokes `afterExecuteOperations` at
[`PhasedScriptAction.ts:970-1000`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/scriptActions/PhasedScriptAction.ts#L970-L1000).

### Operation status events

[`OperationExecutionRecord`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/operations/OperationExecutionRecord.ts#L145-L230)
initializes operations as `Waiting` or `Ready`. Later assignments pass through
the status setter, which invokes the configured status-change callback.

The scheduler and record produce transitions including `Ready`, `Queued`,
`Executing`, `Success`, `SuccessWithWarning`, `Failure`, `Blocked`, `Aborted`,
`Skipped`, `FromCache`, and `NoOp`. The aggregate precedence is failure,
aborted, warning-success, then success
([`OperationExecutionManager.ts:241-335`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/operations/OperationExecutionManager.ts#L241-L335)).

### Built-in output plugins

The action conditionally registers
[`ConsoleTimelinePlugin`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/operations/ConsoleTimelinePlugin.ts#L49-L68)
for `--timeline`, always registers
[`OperationResultSummarizerPlugin`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/operations/OperationResultSummarizerPlugin.ts#L31-L46),
and conditionally registers
[`DebugHashesPlugin`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/operations/DebugHashesPlugin.ts#L12-L38).
The registration order is defined in
[`PhasedScriptAction.ts:404-466`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/scriptActions/PhasedScriptAction.ts#L404-L466).

The standard summarizer groups operations by terminal status, prints condensed
success/cache/skip sections, prints detailed warning/failure sections from each
record's bounded stdio summary, and ends with the aggregate result
([`OperationResultSummarizerPlugin.ts:52-282`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/operations/OperationResultSummarizerPlugin.ts#L52-L282)).

### Full project logs

[`ProjectLogWritable`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/operations/ProjectLogWritable.ts#L93-L241)
writes:

- a merged color-stripped text log;
- a stderr-only text log;
- an optional JSONL chunk log retaining stream identity and ANSI text.

Log paths are generated per project and phase at
[`ProjectLogWritable.ts:250-307`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/operations/ProjectLogWritable.ts#L250-L307).
The bounded console failure summary and full project files are separate
artifacts.

### Error propagation

[`AlreadyReportedError`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/node-core-library/src/AlreadyReportedError.ts#L8-L55)
is a control-flow sentinel indicating that user-facing error output was
already emitted.

At operation level,
[`OperationExecutionManager`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/operations/OperationExecutionManager.ts#L338-L359)
suppresses the stored message for this sentinel and renders other errors into
the operation terminal and summary.

At command level,
[`PhasedScriptAction`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/scriptActions/PhasedScriptAction.ts#L1010-L1027)
distinguishes the sentinel from unexpected errors when rendering completion.
Every unsuccessful non-watch phased execution later throws a fresh sentinel
([`PhasedScriptAction.ts:1160-1169`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/scriptActions/PhasedScriptAction.ts#L1160-L1169)).

At parser level,
[`_reportErrorAndSetExitCode()`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/RushCommandLineParser.ts#L513-L555)
suppresses generic error text for the sentinel, prints other errors, includes
stacks in debug mode, flushes telemetry, and exits nonzero. The parser
preassigns `process.exitCode = 1` and changes it to `0` only after successful
completion
([`RushCommandLineParser.ts:249-300`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/RushCommandLineParser.ts#L249-L300)).

### Telemetry

[`Telemetry`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/Telemetry.ts#L146-L270)
is a separate path from terminal output. Phased execution builds command and
operation result records, invokes `beforeLog`, and calls `Telemetry.log()`
([`PhasedScriptAction.ts:1047-1164`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/scriptActions/PhasedScriptAction.ts#L1047-L1164)).

Flush writes local telemetry files and invokes the session's parallel
`flushTelemetry` hook. `ensureFlushedAsync()` waits for outstanding plugin
flush promises before normal or error exit.

## Code References

- `libraries/rush-lib/src/pluginFramework/PhasedCommandHooks.ts:146-215` - Phased event hooks.
- `libraries/rush-lib/src/logic/operations/OperationExecutionRecord.ts:145-433` - Status and terminal lifecycle.
- `libraries/rush-lib/src/logic/operations/OperationExecutionManager.ts:241-476` - Aggregate execution and status output.
- `libraries/rush-lib/src/logic/operations/OperationResultSummarizerPlugin.ts:31-282` - Fixed result rendering.
- `libraries/node-core-library/src/AlreadyReportedError.ts:8-55` - Already-rendered error sentinel.
- `libraries/rush-lib/src/logic/Telemetry.ts:146-270` - Telemetry storage and flush.

## Architecture Documentation

Current operation events are exposed through phased command hooks, while
presentation is performed by fixed plugins and manager/record methods.
Telemetry consumes a separately assembled representation after command
execution rather than the operation status stream itself.

## Historical Context

Historical plugin research documented `RushSession`, `ILogger`, phased hooks,
and telemetry extension points without a separate reporter abstraction:
[`research/docs/2026-02-07-rush-plugin-architecture.md`](https://github.com/microsoft/rushstack/blob/311a90ee4d57eb3ddfe05bf965c01b94fa879dbf/research/docs/2026-02-07-rush-plugin-architecture.md).

Historical command-registration research documented that plugin command
configuration was discovered before executable plugin loading:
[`research/docs/2026-02-07-plugin-command-registration.md`](https://github.com/microsoft/rushstack/blob/311a90ee4d57eb3ddfe05bf965c01b94fa879dbf/research/docs/2026-02-07-plugin-command-registration.md).

## Related Research

- [Rush output pipeline](./2026-07-12-rush-output-pipeline.md)
- [Rush reporting patterns](./2026-07-12-rush-reporting-patterns.md)
- [Issue #5858 synthesis](../tickets/2026-07-12-5858-rush-reporter-overhaul.md)

## Open Questions

- **Telemetry — partially answered:** Telemetry may consume the
  reporter/underlying event stream or a separate event stream, but it must not
  be limited to presentation-visible data. The meeting did not select an
  integration.
- **Structured errors — partially answered:** Rush-owned producers emit
  structured events with available concise and detailed context; reporters
  choose presentation. External tool output remains stream-based and may be
  interpreted through problem matchers. No event/error schema, stable codes,
  categories, or remediation contract was selected.
- **`AlreadyReportedError` — unresolved:** The meeting identified the current
  log-then-throw pattern but did not decide whether it remains.

See
[the design review note](../notes/2026-07-12-rush-reporter-design-review.md)
for timestamped meeting evidence.
