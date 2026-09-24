# Change Log - @rushstack/rush-cli-client

This log was last generated on Thu, 24 Sep 2026 18:16:59 GMT and should not be manually modified.

## 0.2.0
Thu, 24 Sep 2026 18:16:59 GMT

### Minor changes

- Parse --no-wait and --wait-timeout into daemon admission options, preserve script arguments, and report queue failures without leaking controls to scripts.
- Fence graph mutations against stale workspace generations and support explicit snapshot tokens.
- Route native build/rebuild requests to the production engine and render operation events with awaited output, retaining raw global streams and native reporter-control fallback.
- Retry guaranteed pre-execution hard-restart outcomes once and forward opt-in native install/update requests.
- Add separate opt-in rush-client and rushx-client bins with safe in-process fallback, protocol-based daemon start/status/stop/restart, and local launcher-log reading; document host integration blockers without replacing rush/rushx.
- Implement RUSH_DAEMON_EXPERIMENTAL-gated daemon graph show/status/scope-in/scope-out/invalidate/watch/pause/resume as a public wire/core NDJSON client with no native fallback.
- Tag Rushx requests explicitly, reuse native argument boundaries and frontend discovery output, and validate real daemon script parity with native Rushx.
- Enable negotiated piped stdin and EOF while preserving native fallback input and treating pipe Ctrl+C bytes as data.
- Add asynchronous version-selected daemon connection preparation and prevent the synchronous launcher from impersonating a different Rush engine.
- Document the explicit Node-only persistent daemon path and cover production launch, measured retention, raw Unicode output, cancellation, NoOp/shards, and descriptor/implementation reload through the public client.
- Keep unknown interactive Rushx scripts in-process before consuming input, preserve one cancellable graph admission budget across generation preflight and mutation, and add bounded daemon logs --follow.

### Patches

- Use native filesystem canonicalization so Windows short-path aliases address the same daemon as the host.
- Include the package MIT license and standard publication metadata, enable the pack phase, and document why native fallback reuses the version-selecting Rush frontend.
- Add exact native Rushx alias parity regressions for lifecycle paths, project registration, pnpm-sync diagnostics and safe pre-execution rejection.
- Reuse ownership-checked shutdown for explicit restart and automatically recover implementation-version skew when the selected launcher is available.
- Keep Windows daemon-log following cancellable behind unread stdout using bounded, acknowledged output and an explicitly joined output-only process; preserve snapshot, redirection and I/O-error behavior.

