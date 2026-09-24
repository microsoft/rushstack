# Change Log - @rushstack/rush-daemon

This log was last generated on Thu, 24 Sep 2026 18:16:59 GMT and should not be manually modified.

## 0.6.0
Thu, 24 Sep 2026 18:16:59 GMT

### Minor changes

- Drain explicit pre-execution restart results for accepted requests before closing a retiring host.
- Validate daemon startup configuration and forward idleTimeoutSeconds for the WS3 host lifecycle integration.
- Add gated native graph metadata, dependency-safe scope and invalidation controls, manual-mode pause/resume, and bounded lease-free observation using existing request and extension-event contracts.
- Add opt-in idle shutdown that protects pending requests through output drain and cleanup.
- Support protocol-negotiated acknowledged shutdown and report live process identity and resident memory in status probes.
- Bind positively identified native build/rebuild requests to a production all-project warm engine, preserve exact native selections and cache behavior, refresh inputs between requests, and reject incompatible command shapes or environments before execution.
- Add an explicitly tagged native Rushx resolver and injectable composite resolver with request-owned lifecycle children, canonical cwd/environment overrides, raw output, stdin EOF, and early pipe-close handling.
- Admit request input when its sink attaches, acknowledge drained writes, and forward EOF to owned child stdin without blocking cancellation.
- Select verified bundled or cached daemon installations and prepare exact-engine published releases with native installation APIs. Attest the actual engine and protocol in isolation before launching selected default daemon APIs.
- Make measured telemetry retention reachable through explicit production Node IPC operations. Report raw ranking inputs and exclude only proven native resource-free NoOp nodes from child-memory scoring.
- Reuse unchanged engines, reload changed configuration or command shape in-process under generation admission, and restart process-bound state through existing core ownership/startup contracts. Add isolated native install/update workers with result-before-restart ordering and no post-execution replay.

### Patches

- Expose composable workspace lifecycle capabilities, preserve resolver decorators across generation reloads, dispose generation-owned resolvers, and pass explicit rushx invocations through without phased or graph interception.
- Apply daemon.watch to persistent project file observation with safe idle teardown/re-attachment, preserved runners/results and truthful cleanup accounting. Keep root/config guards and explicit request reconciliation active; never schedule autonomous scripts.
- Refresh prepared graph work under the native execution lease before resuming, preventing stale snapshots and native-command overlap.
- Wait for selected installer closure and strengthen launcher and native-mutation fixture teardown, retaining startup diagnostics and keeping fixture socket paths short.
- Await bounded Linux child-group quiescence after termination and stream closure before completing global requests, preserving immediate descendant-stop assertions and surfacing cleanup inspection failures.
- Load workspace sessions and selected installations using native canonical paths, including Windows short-name aliases.
- Expose the lifecycle-owned last reload tier through a shared live pong and host-status projection, without triggering initialization or deriving a tier from generation changes.
- Use ordinal ordering for request and operation identities, remove unused environment-name enumeration, and document the same-user lifecycle execution boundary.
- Keep endpoint ownership until resolver and workspace cleanup succeed, preventing successor startup against still-resident engine state.
- Acquire one native execution lease per coalesced batch, retain it through reconciliation and output/runner cleanup, and release it before results so native commands can run while the daemon is idle. Permit explicit retries after initialization contention and detect changed rig/inherited configuration before execution.
- Add a generation-owned warm-set attachment with runtime idle, project-limit, sampled memory-budget and telemetry-ranking policies; exclusive scheduler/native leases, awaited runner and scoped watcher eviction, truthful pressure diagnostics, and real native graph integration coverage.
- Preserve Windows Rushx cwd, lifecycle environment and pnpm-sync path spelling while retaining physical workspace identity, confinement and admission-time alias checks.
- Complete automatic warm-controller generation ownership, fencing cold/late attachment and awaiting pending initialization and maintenance before reload locks. Preserve ownership failures, start cold sessions with scoped watchers, expose non-initializing generation and truthful warm accounting in pong/status, and stop certifying evicted graph results from historical observer state.
- Exercise real warm Node IPC children directly on Windows, canonicalize fixture workspace paths for watcher expectations, preserve native active/protected lifetime coverage without timeout increases, and surface complete operation failures in test diagnostics.
- Retain failed request-resource ownership across result delivery, queued work, reload, shutdown and mutation restart. Keep the failed listener alive to prevent competing startup over unjoined children, while preserving ordinary failed-command restarts and successfully cleaned output failures.
- Apply request-local Rushx TTY color and width after native lifecycle environment preparation while preserving explicit non-TTY environments and native path spelling.

## 0.5.2
Tue, 22 Sep 2026 17:35:41 GMT

_Version update only_

## 0.5.1
Mon, 14 Sep 2026 22:42:32 GMT

### Patches

- Forward reporter operation completion and iteration identity through phased request event multiplexing.

## 0.5.0
Sat, 05 Sep 2026 00:15:08 GMT

### Minor changes

- Add authoritative Rush-compatible command result policy and ordered exact-once final result delivery for phased and global requests.
- Add an opt-in isolated execution context for caller-resolved global commands.
- Route request-scoped interactive input and signal PTY-only in-process fallback.
- Classify parsed built-in commands and admit phased and global requests through bounded workspace and graph scheduling.
- Add an opt-in phased request router that validates a caller-resolved selection, reconciles warm invalidations, runs one real graph iteration, scopes ordered streams and events to the client, and safely aborts on cancellation or disconnect.
- Merge compatible shared-build requests into one warm operation-graph iteration.
- Add an opt-in all-project engine component factory with explicit phase/plugin shape, retained invalidation reconciliation, fail-closed graph recreation boundaries, and a deterministic engine shutdown contract.
- Wire validated request lifecycles through shared warm host sessions and typed request resolvers.

## 0.4.1
Fri, 21 Aug 2026 15:16:34 GMT

_Version update only_

## 0.4.0
Fri, 21 Aug 2026 00:15:58 GMT

### Minor changes

- Add a reusable warm workspace session with stable Rush configuration metadata, retained headless invalidations, and deterministic host lifecycle integration.

## 0.3.0
Thu, 20 Aug 2026 00:16:38 GMT

### Minor changes

- Add the rushd executable and workspace-keyed daemon host bootstrap with handshake, liveness, readiness, and clean shutdown lifecycle.

### Patches

- Compile package output for ES2022.

## 0.2.0
Tue, 18 Aug 2026 00:18:33 GMT

### Minor changes

- Add the initial daemon request scheduler.

