---
date: 2026-07-12 14:25:21 UTC
researcher: Sean Larkin
git_commit: 012bae77ba8dd013d8bcd806b55d05c8001e5d92
branch: main
repository: rushstack
topic: "Rush Reporter Overhaul design review"
tags: [research, meeting, rush, reporters, heft, telemetry]
status: complete
last_updated: 2026-07-12
last_updated_by: Sean Larkin
---

# Rush Reporter Overhaul Design Review

## Source

Design review transcript supplied for GitHub issue
[#5858](https://github.com/microsoft/rushstack/issues/5858), covering
00:00-35:47. Speaker identities and attributions are intentionally omitted.

## Decisions

### Scope

- The initial implementation targets the main `rush` binary
  (00:09:25-00:09:44).
- `rushx` is outside the first implementation
  (00:09:25-00:09:35).
- `rush-pnpm` remains a thin shim that preserves pnpm semantics
  (00:09:35-00:10:00).
- Translated locales and scheduling/parallelism changes are not part of this
  work (00:07:18-00:09:25).

### Package and session architecture

- Reporter contracts live in a separate package. `rush-lib` may depend on that
  package, but the reporter package does not depend on `rush-lib`
  (00:10:36-00:10:52).
- A Rush session produces a presentation-free event stream consumed by one or
  more reporters (00:11:25-00:11:43).
- Reporter access becomes part of the Rush plugin/action contract in the same
  breaking change as the Rush daemon work (00:11:45-00:12:20).
- Plugins and actions talk to the centralized reporter subsystem and do not
  know which concrete reporter is active (00:12:20-00:12:45,
  00:25:31-00:25:55).
- Lazy construction of verbose events is deferred; event writes are expected
  to remain inexpensive and be profiled (00:13:03-00:13:26).

### Reporter configuration

- Each reporter owns its configured/default log level
  (00:14:55-00:15:03).
- Output style is reporter-owned rather than a separate global abstraction.
  Individual reporters may expose their own options (00:15:03-00:15:16,
  00:17:37-00:18:09).
- Multiple simultaneous reporters are required. The discussed model is roughly
  one reporter per destination/file descriptor, such as terminal, file, JSON,
  stderr, stdout, or IPC (00:15:47-00:17:20).
- A full-detail file reporter remains active when console or agent output is
  reduced (00:15:47-00:15:56).

### Initialization and compatibility

- Reporter initialization starts at the global version-selector or
  `install-run-rush` boundary so it controls output emitted before the
  repository-selected `rush-lib` loads (00:19:26-00:21:23).
- A lightweight reporter engine communicates with the selected Rush engine
  through the event protocol (00:20:54-00:21:23).
- An older global Rush that encounters an unknown event may direct the user to
  update the global installation; protocol negotiation was not defined
  (00:21:27-00:21:44).

### Structured output and errors

- Rush-owned components emit structured events rather than presentation
  strings. Producers provide available concise and detailed context, and
  reporters decide what to render (00:27:52-00:29:43).
- External tools remain stream-based. Rush can normalize ANSI output and use
  problem matchers to recover structured diagnostics such as file, line, and
  column information (00:29:15-00:30:15).

### Heft

- Heft should gain compatible reporter/event support
  (00:30:19-00:32:48).
- Existing Heft `emitError` and `emitWarning` concepts extend toward generic
  structured event emission (00:31:43-00:32:48).
- Heft reporter integration is a breaking major-version change
  (00:32:49-00:32:57).
- Rush can pass a standard reporter option to Heft and consume a
  machine-understandable stream; the protocol was not specified
  (00:31:35-00:32:30).

### Minimum functional behavior

- The reporter system must replace `StreamCollator`
  (00:34:05-00:34:13).
- Default terminal output is constrained to approximately three lines for
  status, current activity, and completion/liveness (00:34:14-00:35:04).
- A detailed StreamCollator-like reporter remains available for retained or CI
  logs (00:34:28-00:34:42).

## Open Question Answers

| Question | Meeting answer | Status |
| --- | --- | --- |
| Does telemetry consume reporter events? | It may consume the reporter/underlying event stream or a separate stream, but it must not be limited to presentation-visible data. | Partially answered |
| How are newer repository events handled by an older global Rush? | Reporter handling starts globally; an unknown event may produce an update-global-Rush diagnostic. Protocol negotiation remains undefined. | Partially answered |
| What is the smallest migration? | Separate reporter package, early initialization, centralized event emission from actions/plugins, replacement of `StreamCollator`, retained detailed output, and compatible Heft support are agreed foundations. Exact ordering and adapters remain undefined. | Partially answered |
| What happens to `AlreadyReportedError`? | The existing log-then-throw pattern was identified, but retention or replacement was not decided. | Unresolved |
| Are category-mapped exit codes used? | Rush exit-code policy was not discussed. | Unresolved |
| Is localization included? | Translations/locales are out of scope; the string externalization mechanism was not specified. | Partially answered |
| Is CI output selected automatically? | CI-tailored reporters and a detailed CI log format are valid, but automatic selection rules were not decided. | Partially answered |
| Is Heft part of the reporter work? | Yes, with compatible structured reporting and a breaking major version; P0 sequencing was not finalized. | Partially answered |

## Unresolved Details

- Exact reporter protocol and version negotiation.
- Whether `install-run-rush` directly hosts the reporter engine or delegates to
  another bootstrap layer.
- Whether early `apps/rush` output is converted to events or prohibited.
- Exact log-level names, thresholds, and CLI controls.
- Default reporter set and destination configuration syntax.
- Legacy `ITerminal` compatibility for plugins.
- Structured event and error schemas, including codes and remediation.
- Telemetry integration and scope.
- Fate of `AlreadyReportedError`.
- Ordered Rush/Heft migration sequence and P0 boundary.
- Exit-code policy.

## Related Research

- [Issue #5858 synthesis](../tickets/2026-07-12-5858-rush-reporter-overhaul.md)
- [Current Rush output pipeline](../docs/2026-07-12-rush-output-pipeline.md)
- [Current operation reporting](../docs/2026-07-12-rush-operation-reporting.md)
- [Existing reporting patterns](../docs/2026-07-12-rush-reporting-patterns.md)
