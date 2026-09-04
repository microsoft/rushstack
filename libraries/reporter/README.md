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

## Links

- [CHANGELOG.md](https://github.com/microsoft/rushstack/blob/main/libraries/reporter/CHANGELOG.md) - Find out
  what's new in the latest version
- [API Reference](https://api.rushstack.io/pages/reporter/)

`@rushstack/rush-reporter` is part of the [Rush Stack](https://rushstack.io/) family of projects.
