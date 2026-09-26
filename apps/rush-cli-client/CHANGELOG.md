# Change Log - @rushstack/rush-cli-client

This log was last generated on Sat, 26 Sep 2026 00:17:28 GMT and should not be manually modified.

## 0.2.0
Sat, 26 Sep 2026 00:17:28 GMT

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

- Add an opt-in agent output mode on the daemon path (RUSHD_OUTPUT=agent or COPILOT_CLI) with an immediate first line, bounded live progress, and a guaranteed final summary; keep repositories that opt into useRushReporter on the native reporter path.
- Connect to a warm daemon without loading the @microsoft/rush-lib bundle; heavy modules are now loaded only for in-process fallback, rushx discovery, daemon startup, and version selection. The bin scripts also enable the Node.js compile cache when available.
- Make `rush-client daemon stop` idempotent (state notRunning, exit 0), make `daemon restart` start a daemon when none is running, and add `daemon stop --force` to remove stale workspace daemon artifacts.
- Print the error message of a failed daemon result (for example, a daemon shutdown that cancelled the build), and report cancelled requests from "rush-client daemon stop".
- Wait for a running compatible build instead of failing after the default 30-second queue timeout, and explain admission failures with how to wait longer.
- Document the warmSetMaxProjects and warmMemoryBudgetMB daemon policy semantics.
- Use native filesystem canonicalization so Windows short-path aliases address the same daemon as the host.
- Include the package MIT license and standard publication metadata, enable the pack phase, and document why native fallback reuses the version-selecting Rush frontend.
- Exit with 128+signal (130/143/129) and print a cancellation notice when a daemon-routed command is cancelled; handle SIGHUP like SIGTERM.
- Add exact native Rushx alias parity regressions for lifecycle paths, project registration, pnpm-sync diagnostics and safe pre-execution rejection.
- Reuse ownership-checked shutdown for explicit restart and automatically recover implementation-version skew when the selected launcher is available.
- Keep Windows daemon-log following cancellable behind unread stdout using bounded, acknowledged output and an explicitly joined output-only process; preserve snapshot, redirection and I/O-error behavior.

