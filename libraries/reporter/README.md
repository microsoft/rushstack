# @rushstack/rush-reporter

Canonical event protocol, reporter manager, and built-in reporters for Rush.

This package is released as a public beta. Exported contracts may change before the stable release.

Rush 5 keeps legacy terminal output by default. See the
[experimental Rush reporter guide](../../docs/rush/reporter.md) for opt-in controls, reporter behavior,
privacy boundaries, full-detail logs, bootstrap compatibility, and the reproducible repository demo.

## AI reporter qualification

The network-free qualification corpus runs representative bootstrap/version, configuration, input,
dependency-tool, operation, cache, network/auth, plugin, cancellation, and internal failures plus
successful and warning-only controls through the AI, detailed plaintext, legacy, and full-log reporters.
Scenario-specific external output is included only where the real failure or control would produce it.

| Gate | Blocking threshold |
| --- | --- |
| Failure/control coverage | At least 10 failure cases and 2 successful controls |
| Actionability | 100% of failures retain stable code, category, context, and remediation |
| Output size | At most 64 KiB per case; compact cases at most 2 KiB; AI no larger than comparable per-case baselines; aggregate AI bytes at most 50% of legacy and plaintext |
| Determinism | Byte-identical normalized AI output across 3 runs |
| Privacy | 100% secret redaction and no private producer identity leakage |
| Full log | 100% absolute, existing, owner-only where supported, complete, and failure-correlated |
| Stdout/warnings | 100% payload-only NDJSON and warning suppression/detail compliance |

Run `rushx build && node scripts/runAiReporterQualification.js` from this project to print the
machine-readable result. Machine-specific paths are normalized before hashing and are not stored. Passing
these gates only produces a reusable qualification decision; it does not enable environment-based automatic
reporter selection. That decision also requires the separate telemetry privacy prerequisite to be accepted.
The pre-major Rush frontend remains explicit/repository-opt-in, and `RUSH_REPORTER=legacy` remains
authoritative.

AI fallback message text is emitted only for public envelopes. Non-public fallback errors remain countable
and refer to the protected full-detail log. JSON oversized-record markers preserve the original privacy
classification and omit non-public source and scope metadata.

Secret envelopes retain only protocol, event identity, ordering, timing, type, privacy, and fully redacted
source and payload fields. Contextual parent, command, operation, project, phase, and scope metadata is
removed.

## Shadow lifecycle compatibility

Error correlation uses external weak metadata, so frozen and non-extensible errors retain their original
identity, cause, and properties. Correlation remains visible across bridge instances without keeping errors alive.

Rush command-line parse failures emit one session-scoped `RUSH_COMMAND_FAILED` diagnostic before completion.
The original parser message is retained in the diagnostic's local-sensitive `message` parameter; native error
rendering and exit codes remain unchanged. Operation registration observes the final iteration configuration,
so unchanged watch operations do not produce visible shadow registration or status events.

## Shadow parity

Rush's shadow session observer records the selected phased action's real cancellation state at completion.
A gracefully stopped watch command therefore derives the existing logical `cancelled` outcome on subsequent
observations, even when native Rush returns normally with process exit code 0. Legacy completion payloads and
binary telemetry results continue to describe that native exit; shadow reporting does not change process status.
The recorded cancellation state is reset when a new command starts.

Operation output parity tests compare raw terminal chunks, including stream identity and unnormalized ANSI
text, as well as the actual bytes on each stdout/stderr stream.

## Full-detail log completion

The frontend reports an invocation log as complete only after its accepted events and grouped
output have been persisted and the file has closed successfully. Its final `artifactAvailable`
notification is delivered to the remaining reporters after that close; it is not appended to the
same closed log. The log retains command results and session completion, including failed commands.
Flush or close failures leave the artifact incomplete or unavailable and produce an emergency warning
without replacing the command's native exit result.

Full-detail invocation artifacts remain unfiltered even when a lower primary presentation level is
selected. In the combined frontend, file mode exposes that complete artifact rather than a separately
filtered primary transcript.

## Links

- [CHANGELOG.md](https://github.com/microsoft/rushstack/blob/main/libraries/reporter/CHANGELOG.md) - Find out
  what's new in the latest version
- [API Reference](https://api.rushstack.io/pages/reporter/)

`@rushstack/rush-reporter` is part of the [Rush Stack](https://rushstack.io/) family of projects.
