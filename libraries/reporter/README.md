# @rushstack/rush-reporter

Canonical event protocol, reporter manager, and built-in reporters for Rush.

This package is released as a public beta. Exported contracts may change before the stable release.

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
machine-readable result. Byte gates measure the actual emitted UTF-8 strings, including absolute paths and
NDJSON delimiters. Paths are normalized only for deterministic comparison/hashing and are not stored.
Separate near-limit and sustained-watch probes enforce the invocation budget without adding artificial
baseline volume to the comparison corpus. Passing
these gates only produces a reusable qualification decision; it does not enable environment-based automatic
reporter selection. That decision also requires the separate telemetry privacy prerequisite to be accepted.
The pre-major Rush frontend remains explicit/repository-opt-in, and `RUSH_REPORTER=legacy` remains
authoritative.

AI output reserves final-record space, including its supplied log reference, before emitting progress.
Progress is buffered within the invocation byte limit until the primary log reservation is known, or until
close if no log is supplied. Excess progress/details set `truncated`; the final result remains valid JSON.
The final scope carries the command name, and standard `diagnostic.<code>.summary` keys are implicit rather
than repeated alongside the same code. Custom summary keys are preserved.

AI fallback message text is emitted only for public envelopes. Its context retains the known command, and
the usage-review action invokes that command's help (or `rush --help` when the command is unavailable).
Qualification checks exact expected context, remediation commands/URLs, descriptions, and execution safety;
summary-only failures and unrelated actions do not qualify. Non-public fallback errors remain countable
and refer to the protected full-detail log. JSON oversized-record markers preserve the original privacy
classification and omit non-public source and scope metadata.

Secret envelopes retain only protocol, event identity, ordering, timing, type, privacy, and fully redacted
source and payload fields. Contextual parent, command, operation, project, phase, and scope metadata is
removed.

## Links

- [CHANGELOG.md](https://github.com/microsoft/rushstack/blob/main/libraries/reporter/CHANGELOG.md) - Find out
  what's new in the latest version
- [API Reference](https://api.rushstack.io/pages/reporter/)

`@rushstack/rush-reporter` is part of the [Rush Stack](https://rushstack.io/) family of projects.
