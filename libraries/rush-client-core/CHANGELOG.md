# Change Log - @rushstack/rush-client-core

This log was last generated on Sat, 26 Sep 2026 00:17:28 GMT and should not be manually modified.

## 0.2.0
Sat, 26 Sep 2026 00:17:28 GMT

### Minor changes

- Support one ownership-attested pre-execution restart retry, cancellation during handoff, and native mutation protocol admission.
- Introduce the opt-in daemon client with immutable requests, backpressured output, cancellation, raw input cleanup, private append-only launcher logs, serialized detached startup, and protocol-gated shutdown with bounded ownership-release coordination.
- Capture the native invocation kind, reject Rushx peers older than protocol 0.8 before request submission, and prevent fallback after output or stdin admission.
- Stream bounded stdin chunks only after admission and write credits, deliver ordered EOF, and preserve input for fallback to older peers.
- Replace a mismatched daemon implementation under the startup mutex using an explicit launcher and verified ownership, before submitting any request.

### Patches

- Add IConnectOrStartDaemonOptions.resolveStartCommandAsync so a start command is resolved only when a daemon must be started or replaced.
- Reclaim provably stale daemon artifacts (a socket without an ownership record, a corrupt record, or a Linux PID reused since the record was written) instead of permanently disabling the daemon, and add resetDaemonArtifactsAsync() as the explicit recovery path referenced by fail-closed messages.
- Retry daemon restarts with jittered backoff inside the admission deadline and return a `restartRetriesExhausted` fallback outcome instead of failing when successors keep restarting for other environments.
- Return the daemon shutdown acknowledgement, including its optional active request count, from DaemonClient.shutdownAsync().
- Join detached startup helper closure without prematurely disconnecting IPC, keep its cwd outside the launched workspace, and drain failed launcher processes before reporting startup failure.
- Reject in-process fallback after terminal control, even without a stdin source, while restoring raw mode and avoiding command replay.
- Hand detached daemon startup to an independent helper with a durable pre-bind reservation. Prevent duplicate launches after the starting client dies, preserve explicit launch commands and ownership-based restart, and fail closed on ambiguous launcher failures.
- Include the package MIT license and standard publication metadata, and enable the pack phase.
- Reuse the validated native Windows LockFile exclusion for startup instead of maintaining a separate pipe mutex, preserving durable crash reservations and fail-closed handoff behavior.
- Honor cancellation during daemon hello/pong readiness, close newly ready clients when cancellation wins, and preserve abort reasons instead of treating handshake failures as retryable.
- Use an OS-owned Windows startup mutex and keep sharing-denied ownership reads unknown until the existing handoff deadline, preserving fail-closed startup and no-replay behavior.
- Retry pre-request handshake resets within the startup deadline while a closing daemon retains resource ownership. Preserve fail-closed ownership checks and prohibit replay after execution begins.

