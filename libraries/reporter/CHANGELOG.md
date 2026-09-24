# Change Log - @rushstack/rush-reporter

This log was last generated on Thu, 24 Sep 2026 18:16:59 GMT and should not be manually modified.

## 0.4.0
Thu, 24 Sep 2026 18:16:59 GMT

### Minor changes

- Add adversarial deterministic AI reporter qualification gates and privacy-safe actionable context.

### Patches

- Prevent non-public reporter events from contributing unvalidated or unbounded values to telemetry aggregates, protect parent-owned producer and protocol metadata, and preserve the original five-field performance budget contract.
- Redact classified secret source aliases in machine JSON without losing owner-only file context, and qualify every machine output for producer privacy.
- Coalesce buffered start acknowledgements superseded by final results without dropping final context or log references, keeping native Windows AI output within the unchanged raw-byte qualification budget.
- Refresh quiet interactive operations and emit plaintext heartbeats using unrefed timers that stop when reporters close.
- Run background renderer timers through the manager's failure boundary and cancel them on reporter failure or close without changing successful command outcomes.
- Prevent human diagnostic source metadata from revealing aliases of explicitly secret parameters while retaining unrelated local-sensitive details.
- Bound individual telemetry diagnostic codes without truncation and exclude secret diagnostic codes and categories from aggregates.
- Abort all attempted reporter initializations synchronously before serialized disposal, preserving the startup failure reason and once-only cleanup.
- Measure actual AI output bytes, enforce the invocation-wide NDJSON budget, and qualify retained fallback context and exact remediation without inflating baselines.

## 0.3.1
Tue, 22 Sep 2026 17:35:41 GMT

_Version update only_

## 0.3.0
Mon, 14 Sep 2026 22:42:32 GMT

### Minor changes

- Extend OperationStreamEmitter with silent registration metadata, previous status, stream-close, and operation-completion events.
- Render phase-aware compact progress and grouped plaintext full logs from the canonical operation stream.
- Add bidirectional Heft child negotiation, parent-owned rendering context, bounded structured output, and streaming problem matcher recovery.

### Patches

- Add the opt-in reporter guide covering built-in renderers, full logs, privacy, and rollout safety.
- Add a stable structured diagnostic code for Rush command failures.
- Preserve ordered legacy fallback output when a bootstrap handoff protocol is incompatible.
- Prevent non-public reporter events from contributing unvalidated or unbounded values to telemetry aggregates, protect parent-owned producer and protocol metadata, and preserve the original five-field performance budget contract.
- Correlate diagnostics using weak metadata instead of mutating potentially frozen or non-extensible errors.
- Reject negotiated Heft diagnostics that forge registered categories or template keys or supply invalid one-based source coordinates, while preserving optional diagnostic fields and severity overrides.
- Preserve readable tool, compiler code, source location, and message details in human diagnostic output while redacting secret values.
- Honor the pass-through separator when distinguishing command JSON from reporter JSON controls.
- Prevent human diagnostic source labels, lower-classified parameters, and forwarded Heft diagnostics from redisplaying explicitly secret parameter values.
- Show bounded interactive errors immediately and warnings once per watch cycle, and preserve grouped output across short writes without overstating log completeness.
- Bound individual telemetry diagnostic codes without truncation and exclude secret diagnostic codes and categories from aggregates.
- Dispose attempted reporter initialization safely and bound owned abandoned bootstrap handoffs by age and session count.
- Share once-only reporter close operations and serialized lifecycle ordering across manager shutdown and initialization disposal, including failed closes and lifecycle errors.

## 0.2.0
Sat, 05 Sep 2026 00:15:08 GMT

### Minor changes

- Initial public beta scaffold of the @rushstack/rush-reporter package
- Add the canonical reporter event envelope, closed core event type union, privacy classification, and JSON payload types
- Add the scoped producer API (IReporterEventSink, IScopedReporter) and namespaced extension event names
- Add structured diagnostics: category, remediation, and source types, a central RUSH_<DOMAIN>_<NAME> code registry with English templates, field privacy floor helpers, createRushDiagnostic, and RushError
- Add the NDJSON wire protocol: protocol version and byte limits, an NDJSON encoder and streaming decoder, and hello/helloAck capability negotiation with an update-global-Rush diagnostic
- Add ReporterManager and IReporter: monotonic session ordering, per-reporter queues, exclusive destination ownership with a multiplexer, timed flush/close, status coalescing, and optional/required failure handling
- Add the two-stage bootstrap machinery: a frozen self-contained event buffer/encoder with 1 MiB overflow handling and a bufferTruncated event, temporary NDJSON handoff file helpers, and an early reporter controls parser
- Add ReporterHost: the frontend-owned manager that replays and deletes the bootstrap handoff, exposes a typed sink to rush-lib without selection ownership, skips direct invocations, and cleans abandoned handoff files
- Add cross-version compatibility adapters: resolveReporterCompatibility, createEngineSink with a LegacyFallbackSink for old-frontend/new-engine fallback, and OldEngineOutputAdapter that bridges an old engine's raw output into structured events
- Add scoped session reporting (createScopedReporter, RushSessionReporting, IScopedLogger, execution context) and Rush version range compatibility with a migration diagnostic
- Add shadow-phase lifecycle emission: typed lifecycle payloads, a LifecycleEmitter for session/command/operation and diagnostic events, and exit-code and result parity helpers
- Add the telemetry projection subscriber that produces an allowlisted aggregate from canonical events, a reporter adapter to observe events before filtering, and a beforeLog adapter
- Add reporter-independent exit-code semantics (resolveExitStatus, resolveExitStatusFromEvents, getSignalExitCode) and separateJsonControls to keep command-specific --json distinct from the json reporter
- Add reporter selection with precedence: reporter names and log levels, agent and CI detection, --output parsing, and resolveReporterSelection that resolves the primary reporter and log level from CLI controls and the environment
- Add independent per-reporter log-level filtering (quiet/normal/verbose/debug) with event classification, keeping diagnostic severity separate, and default the file reporter to debug
- Add the automatic reporter selection matrix (planAutomaticReporters, describeReporterPlan, isMachineReporter) that maps agent, CI, TTY, and non-TTY environments to reporters and gives machine reporters exclusive stdout
- Add the default interactive reporter with a three-row live region, spinner, width-aware active projects, throttled refresh, cursor restoration, failure diagnostic block, watch summaries, and NO_COLOR/FORCE_COLOR handling
- Add the append-only plaintext and non-TTY reporter with concise and detailed variants, a 30-second heartbeat, StreamCollator-like grouping in detailed CI mode, and stable snapshots
- Add the JSON reporter that emits the complete NDJSON event stream and the bounded AI reporter with a 64 KiB, 20-diagnostic projection carrying result, scope, codes, remediation, counts, and log reference
- Add the full-detail file reporter that writes a debug NDJSON invocation log with owner-only permissions, secret redaction, a latest.log pointer, 14-day and 20-session retention, an OS-temp fallback, and nonfatal failure handling
- Add the legacy reporter that reproduces the current Rush StreamCollator-style output, selectable and available as the RUSH_REPORTER=legacy emergency fallback, validated against the frozen legacy snapshots
- Add OperationStreamEmitter and grouping helpers that replace StreamCollator with a raw, uncollated operation event stream, letting reporters own grouping and problem matchers consume the source stream
- Add problem matchers that recover linked diagnostics from preserved external output: ANSI normalization, a tool- and version-scoped registry with default-enablement gating, and a runner with line reassembly, evidence preservation, and duplicate caps
- Add the legacy error bridge that correlates AlreadyReportedError sentinels with emitted diagnostics and suppresses duplicate rendering, and deprecate AlreadyReportedError to prohibit new usage
- Add Heft integration over a negotiated inherited descriptor: HeftChildEmitter and HeftDescriptorHost with parent/child event correlation, a raw-stream fallback for older Heft, and descriptor allocation helpers
- Add reporter performance and capacity budgets: a perf module encoding the specification blocking budgets with wall-time and memory helpers, plus a ReporterManager.getPendingEventCount observability hook for bounded streaming
- Add the daemon-aligned major default-flip migration model: the reporter migration phases, pre-flip and post-flip major default sets, and a plugin apply gate that fails incompatible plugins before apply() with a structured migration diagnostic
- Apply design-review realignments to the reporter contracts: rename the package to @rushstack/rush-reporter; add the messageEmitted core event type with a fail-safe local-sensitive default for message text; enforce diagnostic codes and template keys at the type level with per-domain template modules; make diagnostic categories forward-compatible; make diagnostic sources a kind-tagged discriminated union; scope event identity to (sessionId, eventId); derive the envelope required flag from the event type in ReporterManager; govern handshake capabilities with a registry; and document the two-tier constant policy and full beta license.

### Patches

- Add the source-of-truth frozen bootstrap envelope encoder and deterministic generation check for install-run-rush.

