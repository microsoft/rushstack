---
date: 2026-07-12 14:11:07 UTC
researcher: Sean Larkin
git_commit: 012bae77ba8dd013d8bcd806b55d05c8001e5d92
branch: main
repository: rushstack
topic: "GitHub issue #5858: Rush Reporter Overhaul"
tags: [research, codebase, rush, reporters, terminal, errors, telemetry]
status: complete
last_updated: 2026-07-12
last_updated_by: Sean Larkin
last_updated_note: "Added design review transcript decisions and open-question answers"
---

# Research

## Research Question

Use the `research-codebase` skill to help with GitHub issue
[#5858, "[rush] Rush Reporter Overhaul"](https://github.com/microsoft/rushstack/issues/5858).

The refined scope documents the current Rush reporting/output architecture
from bootstrap through phased execution, including terminal routing,
summarizers, plugins, verbosity controls, error propagation, telemetry,
package boundaries, Heft patterns, localization infrastructure, and historical
research relevant to the reviewed issue design.

## Summary

The current codebase has no Rush-wide `IReporter`, `ReporterManager`,
`RushError` hierarchy, global `--reporter`, global `--log-level`,
`COPILOT_CLI`, or `RUSH_REPORTER` implementation. Reporting is distributed
across three startup layers, `@rushstack/terminal`, `StreamCollator`, phased
operation hooks, manager/record output methods, fixed completion plugins,
project log writers, `AlreadyReportedError`, and a separate telemetry path.

The reviewed design in the
[#5858 design comment](https://github.com/microsoft/rushstack/issues/5858#issuecomment-4949487094)
maps onto existing code surfaces as follows:

| Design area | Current implementation surface |
| --- | --- |
| Initialization before repo `rush-lib` | `install-run-rush`, `apps/rush/start.ts`, `RushVersionSelector`, `RushCommandSelector` |
| Session/plugin output | `RushSession`, `ILogger`, shared `ITerminalProvider` |
| Structured operation lifecycle | `OperationStatus`, `PhasedCommandHooks`, `OperationExecutionRecord`, `OperationExecutionManager` |
| Current console presentation | `OperationExecutionManager`, `OperationResultSummarizerPlugin`, `ConsoleTimelinePlugin`, `DebugHashesPlugin` |
| Multiple output destinations | `Terminal` providers, `SplitterTransform`, project text/error/JSONL logs |
| Full-detail log retention | `ProjectLogWritable`, `OperationMetadataManager` |
| Error suppression/deduplication | `AlreadyReportedError`, parser and phased-action catches |
| Telemetry | `Telemetry`, phased `beforeLog`, session `flushTelemetry` |
| Reporter-like package patterns | Heft `LoggingManager`, `ScopedLogger`, `HeftJestReporter`, API Extractor message callbacks |
| String externalization | `@rushstack/localization-utilities` |

## Detailed Findings

### Issue design context

The issue identifies verbose output, limited liveness signals, and
unstructured error context for both users and agents. The reviewed design adds:

- pluggable reporters selected by flag or environment;
- one presentation-free event stream with multiple subscribers;
- concise default build output plus an always-on full-detail file;
- agent-specific output under `COPILOT_CLI`;
- structured, code-keyed errors;
- a reporter contract package that can initialize before `rush-lib`;
- compatible reporter work in Heft.

The design explicitly leaves telemetry/event-stream integration, cross-version
event compatibility, migration sequence, and category-mapped exit codes open.

### Startup boundaries

The first output can occur before `rush-lib` is loaded:

1. [`install-run-rush.ts`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/scripts/install-run-rush.ts#L23-L125)
   selects and installs `@microsoft/rush`.
2. [`apps/rush/src/start.ts`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/apps/rush/src/start.ts#L36-L105)
   handles frontend warnings and version selection.
3. [`RushVersionSelector`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/apps/rush/src/RushVersionSelector.ts#L26-L102)
   installs/loads the requested engine.
4. [`RushCommandSelector`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/apps/rush/src/RushCommandSelector.ts#L28-L64)
   calls the selected library's `Rush.launch*()` API.

These layers currently use their own direct console or logger output and quiet
checks.

### Current command-line surface

[`RushCommandLineParser`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/RushCommandLineParser.ts#L99-L231)
defines global `--debug` and `--quiet`. `--json` exists on individual commands,
and its literal presence suppresses ancillary startup output. Phased
`--verbose` is separately defined by
[`PhasedScriptAction`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/scriptActions/PhasedScriptAction.ts#L257-L261).

Current pnpm `--reporter` usage configures pnpm rather than Rush:
[`WorkspaceInstallManager.ts:863-880`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/installManager/WorkspaceInstallManager.ts#L863-L880)
and
[`BaseInstallManager.ts:895-901`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/base/BaseInstallManager.ts#L895-L901).

### Current event and presentation path

Status changes are present as structured enum values and hook callbacks.
[`OperationExecutionRecord.status`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/operations/OperationExecutionRecord.ts#L222-L230)
notifies the manager, which forwards changes through
[`PhasedCommandHooks.onOperationStatusChanged`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/pluginFramework/PhasedCommandHooks.ts#L166-L174).

Presentation remains distributed:

- operation activation headers and status-specific messages are emitted by
  [`OperationExecutionManager`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/operations/OperationExecutionManager.ts#L203-L235);
- final grouped results are emitted by
  [`OperationResultSummarizerPlugin`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/operations/OperationResultSummarizerPlugin.ts#L52-L282);
- optional timeline/debug output is emitted by separate plugins;
- startup banners, action-start lines, parser errors, and frontend warnings are
  outside the phased hook stream.

### Multiple destinations and retained logs

The terminal package already supports multiple providers and explicit fan-out.
[`SplitterTransform`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/terminal/src/SplitterTransform.ts#L19-L97)
sends one immutable terminal chunk to multiple destinations.

Each operation can write:

- live collated console output;
- merged text log;
- stderr-only text log;
- JSONL terminal chunks;
- bounded stdio failure summary;
- collected problems.

The graph is assembled by
[`OperationExecutionRecord`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/operations/OperationExecutionRecord.ts#L293-L385),
and file destinations are implemented by
[`ProjectLogWritable`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/operations/ProjectLogWritable.ts#L93-L241).

### Errors and exit codes

Current structured error information is split between thrown `Error` objects,
stored operation errors, operation statuses, plugin logger collections, and
telemetry fields. The common deduplication mechanism is
[`AlreadyReportedError`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/node-core-library/src/AlreadyReportedError.ts#L8-L55).

The parser sets a defensive failure exit code before execution and changes it
to success only after command completion
([`RushCommandLineParser.ts:249-300`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/RushCommandLineParser.ts#L249-L300)).
Current failures therefore use the normal process failure code rather than a
Rush error-category mapping.

### Telemetry

Phased telemetry is assembled after execution from the command result and
operation records, then passed through `beforeLog`
([`PhasedScriptAction.ts:1047-1164`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/cli/scriptActions/PhasedScriptAction.ts#L1047-L1164)).
[`Telemetry`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/rush-lib/src/logic/Telemetry.ts#L146-L270)
writes local records and delivers batches to the session's
`flushTelemetry` hook. It does not currently consume a shared presentation
event stream.

### Package relationships

Current package dependencies flow from Rush into terminal infrastructure:

- `@microsoft/rush` depends on `@microsoft/rush-lib` and
  `@rushstack/terminal`;
- `@microsoft/rush-lib` depends on `@rushstack/terminal` and
  `@rushstack/stream-collator`;
- `@rushstack/stream-collator` depends on `@rushstack/terminal`;
- Heft depends on `@rushstack/terminal` and
  `@rushstack/operation-graph`.

No separate reporter-contract package exists in this revision.

### Heft and other reporter-like implementations

Heft owns scoped loggers through
[`LoggingManager`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/apps/heft/src/pluginFramework/logging/LoggingManager.ts#L16-L103)
and derives final action status from aggregated logging and operation results.

The Jest integration provides direct reporter injection:
[`JestPlugin`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/heft-plugins/heft-jest-plugin/src/JestPlugin.ts#L827-L891)
replaces Jest's default reporter with
[`HeftJestReporter`](https://github.com/microsoft/rushstack/blob/012bae77ba8dd013d8bcd806b55d05c8001e5d92/heft-plugins/heft-jest-plugin/src/HeftJestReporter.ts#L37-L248)
while preserving configured third-party reporters.

### String externalization

The repository already contains parsing and typing infrastructure for
externalized strings in
[`@rushstack/localization-utilities`](https://github.com/microsoft/rushstack/tree/012bae77ba8dd013d8bcd806b55d05c8001e5d92/libraries/localization-utilities).
Current Rush CLI reporter/error strings documented in this research remain
inline in their emitting classes.

## Code References

- `libraries/rush-lib/src/scripts/install-run-rush.ts:23-125` - Earliest managed Rush output.
- `apps/rush/src/start.ts:36-105` - Frontend output and selected-engine boundary.
- `libraries/rush-lib/src/cli/RushCommandLineParser.ts:99-555` - Global flags, startup suppression, errors, and exit behavior.
- `libraries/rush-lib/src/pluginFramework/PhasedCommandHooks.ts:146-215` - Existing phased lifecycle events.
- `libraries/rush-lib/src/logic/operations/OperationExecutionManager.ts:203-476` - Current progress/status presentation.
- `libraries/rush-lib/src/logic/operations/OperationResultSummarizerPlugin.ts:31-282` - Current final presentation.
- `libraries/rush-lib/src/logic/operations/ProjectLogWritable.ts:68-307` - Full text and JSONL logs.
- `libraries/rush-lib/src/logic/Telemetry.ts:146-270` - Separate telemetry path.
- `apps/heft/src/pluginFramework/logging/LoggingManager.ts:16-103` - Heft logger aggregation.
- `heft-plugins/heft-jest-plugin/src/JestPlugin.ts:827-891` - Existing reporter injection.

## Architecture Documentation

```text
install-run-rush
  → @microsoft/rush frontend
    → selected rush-lib
      → RushCommandLineParser / RushSession
        → PhasedScriptAction / PhasedCommandHooks
          → OperationExecutionManager
            → OperationExecutionRecord terminal graph
              ├─ StreamCollator → console
              ├─ project text/error/JSONL logs
              ├─ stdio summary
              └─ problem collector
          → timeline/result plugins
        → AlreadyReportedError / parser exit handling
        → separately assembled telemetry
```

## Historical Context

The current checkout has no `research/` history, but relevant documents remain
reachable in Git history:

- [`2026-02-07-rush-plugin-architecture.md`](https://github.com/microsoft/rushstack/blob/311a90ee4d57eb3ddfe05bf965c01b94fa879dbf/research/docs/2026-02-07-rush-plugin-architecture.md) documented `RushSession`, `ILogger`, phased hooks, and telemetry extension points, with no reporter abstraction.
- [`2026-02-07-plugin-command-registration.md`](https://github.com/microsoft/rushstack/blob/311a90ee4d57eb3ddfe05bf965c01b94fa879dbf/research/docs/2026-02-07-plugin-command-registration.md) documented command discovery and deferred plugin loading.
- [`2026-02-07-rushstack-architecture-and-build-systems.md`](https://github.com/microsoft/rushstack/blob/311a90ee4d57eb3ddfe05bf965c01b94fa879dbf/research/docs/2026-02-07-rushstack-architecture-and-build-systems.md) documented package roles for Rush, `rush-lib`, the SDK, terminal, and command-line packages.
- [`2026-02-07-upgrade-interactive-implementation.md`](https://github.com/microsoft/rushstack/blob/311a90ee4d57eb3ddfe05bf965c01b94fa879dbf/research/docs/2026-02-07-upgrade-interactive-implementation.md) documented direct interactive terminal behavior without a CI-specific fallback.
- [`2026-01-23-interactive-upgrade-ui-rewrite.md`](https://github.com/microsoft/rushstack/blob/daada7cfa94ab0b3eaeca355706ba95f876fceb4/research/specs/2026-01-23-interactive-upgrade-ui-rewrite.md) proposed TTY/CI rendering tiers and cited GitHub Copilot CLI as an Ink adopter; it did not define a reporter integration.

These documents are historical context; the live-code findings above are based
on commit `012bae77ba8dd013d8bcd806b55d05c8001e5d92`.

## Related Research

- [Current Rush startup and output pipeline](../docs/2026-07-12-rush-output-pipeline.md)
- [Current phased reporting, errors, and telemetry](../docs/2026-07-12-rush-operation-reporting.md)
- [Existing reporting and localization patterns](../docs/2026-07-12-rush-reporting-patterns.md)
- [Rush Reporter Overhaul design review](../notes/2026-07-12-rush-reporter-design-review.md)

## Follow-up Research 2026-07-12 14:25 UTC

The design review confirms these directions:

1. **Package boundary:** Reporter contracts live in a separate package.
   `rush-lib` depends on the reporter package, not the reverse.
2. **Session event stream:** A Rush session produces a presentation-free event
   stream with one or more reporter subscribers.
3. **Plugin/action contract:** Plugins and actions emit into the centralized
   subsystem and cannot depend on a concrete reporter.
4. **Reporter configuration:** Log level is configured per reporter. Output
   style belongs to the reporter rather than a separate global axis.
5. **Multiple destinations:** Multiple reporters are mandatory, with a model
   approximating one reporter per file descriptor or destination. A
   full-detail file reporter remains active alongside reduced console output.
6. **Early initialization:** Reporter handling starts at the version selector
   or `install-run-rush` boundary so it owns output before repository
   `rush-lib` loads.
7. **Structured Rush output:** Rush-owned code emits structured events rather
   than presentation strings. External tool streams remain ingestible, with
   problem matchers recovering structured diagnostics where possible.
8. **Heft:** Heft gains compatible structured reporting in a breaking major
   version. Rush can pass it a reporter option and consume a
   machine-understandable stream.
9. **Minimum behavior:** The reporter system replaces `StreamCollator`, reduces
   default terminal output to approximately three status/activity/result
   lines, and retains a detailed StreamCollator-like format for CI or log
   browsing.
10. **Initial scope:** The main `rush` binary is the target. `rushx` is outside
    the first implementation, and `rush-pnpm` remains a thin pnpm shim.

The complete timestamped decision record is in
[the design review note](../notes/2026-07-12-rush-reporter-design-review.md).

## Open Questions After Design Review

| Question | Answer from the design review | Status |
| --- | --- | --- |
| Does telemetry consume reporter events? | Telemetry may consume the reporter/underlying event stream or a separate event stream. It must not be restricted to only presentation-visible data. No integration was selected. | Partially answered |
| How does an older global frontend handle newer repository event types? | Reporter initialization occurs in the global bootstrap. An unknown event may produce a diagnostic asking the user to update global Rush, but protocol/version negotiation remains undefined. | Partially answered |
| What is the smallest migration sequence? | Agreed foundations are a separate package, early initialization, centralized action/plugin events, replacement of `StreamCollator`, retained detailed output, and compatible Heft support. Exact order, compatibility adapters, and P0 boundary remain undefined. | Partially answered |
| Are category-mapped exit codes opt-in or default? | Exit-code behavior was not discussed. | Unresolved |
| Does `AlreadyReportedError` remain? | The existing log-then-throw pattern was identified, but retention or replacement was not decided. | Unresolved |
