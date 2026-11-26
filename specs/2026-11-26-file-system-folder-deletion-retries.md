# FileSystem folder-deletion retry specification

## Problem and scope

Implement the feedback in
[microsoft/rushstack#6230](https://github.com/microsoft/rushstack/issues/6230)
on [microsoft/rushstack#5836](https://github.com/microsoft/rushstack/pull/5836).
This specification supersedes the implementation proposed in
[microsoft/rushstack#6231](https://github.com/microsoft/rushstack/pull/6231).

Windows users of Rush, Heft, and other `FileSystem` consumers can encounter
transient deletion failures while another process holds a file handle. Native
Node.js retries do not provide a consistent, whole-operation budget across
Node.js versions and synchronous/asynchronous implementations.

The affected methods in
[`FileSystem.ts`](../libraries/node-core-library/src/FileSystem.ts) are:

- `FileSystem.deleteFolder`
- `FileSystem.deleteFolderAsync`
- `FileSystem.ensureEmptyFolder`
- `FileSystem.ensureEmptyFolderAsync`

Additionally, the current emptying implementation uses `Dirent.parentPath`,
which is unavailable on Node.js 20.9-20.11, and calls another static method
through `this`, which breaks unbound calls. Its asynchronous parallel loop
can reject before other started child deletions settle.

No public signatures, dependencies, package engine requirements, or other
filesystem methods will change. `move`, `moveAsync`, resource-exhaustion
recovery, custom recursive traversal, and new caller-configurable options are
out of scope.

## Required retry behavior

1. A public invocation has one initial attempt and at most three retries.
   Successful attempts return immediately, without waiting.
2. Retry only when `process.platform === 'win32'` and the error's `code` is
   exactly `EBUSY`, `ENOTEMPTY`, or `EPERM`. Code classification does not require
   additional `errno`, `syscall`, or `path` properties.
3. Wait 100 ms before attempt 2, 200 ms before attempt 3, and 300 ms before
   attempt 4. Do not wait after attempt 4 fails.
4. Other errors, including `EACCES`, `EMFILE`, `ENFILE`, missing codes, and
   unrecognized/empty codes, end the operation without further retries.
   On non-Windows platforms, any failure ends the operation immediately.
5. Retry the whole deletion or emptying operation, not individual children.
   All children and all stages of one emptying invocation share the budget.
6. Every underlying removal uses `fs.rmSync` or `fs.promises.rm` with
   `{ recursive: true, force: true, maxRetries: 0, retryDelay: 0 }`.
   Explicitly disabling both native retry settings avoids additional native
   retries and native waits after the last failure.
7. Preserve the selected error object. Apply the existing `_wrapException`
   or `_wrapExceptionAsync` decoration once, outside the retry loop, only when
   the public invocation ultimately fails.

The delays describe the wait schedule, not a maximum total duration. Timers
can run late, and retries repeat filesystem work. Separate locked children
can consume the shared budget on different attempts; this is an accepted
tradeoff to avoid depth-dependent budgets and a new recursive-delete engine.

## Folder-emptying behavior

Each attempt reads child names using `fsx.readdirSync` or `fsx.readdir`,
joins each name with the caller's `folderPath`, and removes the children
without deleting the parent. Do not use `Dirent.parentPath` or rely on a
bound `this`. Re-read the directory after a partial failure so already-removed
children are not scheduled again.

If enumeration fails with `ENOENT`, create the folder using the existing
`fs-extra` directory-creation operation. Propagate every other enumeration
error, including `ENOTDIR`; do not remove or replace a file occupying the
requested path. Errors during creation are part of the same attempt and
follow the same retry policy.

Keep existing successful behavior for missing, empty, and non-empty folders,
relative paths, nested contents, and child entries removed concurrently by
another process (`force: true`). Retrying does not make these operations
transactional or guarantee the folder remains empty if another process adds
children after enumeration.

### Asynchronous draining and error selection

Retain the limit of 10 concurrent top-level child-removal calls:

1. Before starting a child-removal call, check whether a failure has already
   been observed in this attempt. If so, skip starting that call.
2. Catch and record each started child's failure locally, allowing its
   callback to fulfill so `Async.forEachAsync` waits for all started callbacks.
   A separate failure flag must distinguish "no failure" from the value thrown.
3. Preserve the first observed error unless a later error has a non-transient
   code and the preserved error has a transient code. Here, "transient" means
   exactly `EBUSY`, `ENOTEMPTY`, or `EPERM`, irrespective of platform. Prefer
   the first non-transient error on every platform; the decision to retry
   remains Windows-only. Missing and unknown codes count as non-transient.
4. After all started calls settle, throw the selected error, if any. Only then
   may the outer helper decide to retry or reject.

This prevents retries from overlapping top-level removals from the preceding
attempt and prevents the public method from rejecting while those removal
promises are still pending. The limit and draining guarantee apply to calls
owned by node-core-library, not recursive work inside Node.js. Node's own
recursive implementation may reject while its internal work remains in
flight; redesigning that implementation is out of scope.

## Implementation constraints

- Use small, private synchronous and asynchronous retry helpers in the
  existing `FileSystem.ts`, sharing the error/budget predicate.
- Synchronous waits use `Atomics.wait` on an `Int32Array` backed by a
  `SharedArrayBuffer`. Asynchronous waits use `Async.sleepAsync`.
- Keep the sleep calls mockable without exporting test-only APIs; spies on
  `Atomics.wait` and `Async.sleepAsync` are sufficient if verified by tests.
- Keep the retry predicate platform check dynamic so deterministic tests
  can substitute the platform. Include the issue's explanatory comment about
  Windows open-handle semantics and extending the policy only if needed.
- Replace the existing `FS_RM_DEFAULT_OPTIONS` comment with an explanation
  that native retries and waits are deliberately disabled.
- Reuse `Async.forEachAsync` without changing its semantics for other callers.
  Do not use `Async.runWithRetriesAsync`, which retries arbitrary errors with
  a constant delay.

## Documentation and release notes

All four methods' TSDoc will include:

> On Windows, if the operation fails with an error reported as `EBUSY`,
> `ENOTEMPTY` or `EPERM`, it is retried up to three times, with delays of
> 100, 200 and 300 milliseconds between attempts.

"Reported as" is intentional: native synchronous error-code reporting varies
by Node.js version, and unknown codes must not be inferred or retried.
Document the folder read-error behavior and clarify that asynchronous
draining and concurrency apply to top-level calls.

The release notes must address the
[changelog review comment](https://github.com/microsoft/rushstack/pull/6231#discussion_r4714037958):
state the benefit and impacted callers concisely, not the implementation.
Use Markdown code quotes for code references.

The user approved consolidating the still-unreleased change file from
microsoft/rushstack#5836:
[`bartvandenende-wm-5373_2026-06-16-19-03.json`](https://github.com/microsoft/rushstack/blob/020c60a7bee6e6a673eab453c2b324bf9810b7ea/common/changes/%40rushstack/node-core-library/bartvandenende-wm-5373_2026-06-16-19-03.json).
Delete that pending file and add a new patch change file with two short entries:

1. The Windows reliability benefit for callers of all four deletion methods
   when another process temporarily holds a file open.
2. The user-visible emptying behavior changes relative to the last published
   package: at most 10 concurrent top-level deletions in
   `FileSystem.ensureEmptyFolderAsync`, and propagation of folder read errors
   other than `ENOENT` by both emptying methods instead of silently leaving
   an unreadable folder unemptied.

Do not retain the earlier file's contradictory claim that native retries
implement the fix, or duplicate the same feature across change files. A newly
added file is required for `rush change --verify`, which detects added change
files rather than edits to existing pending files.

The Node.js 20.9-20.11 and unbound-call regressions were introduced only on
unreleased `main`. Explain these fixes in the spec and PR description, not as
regressions affecting a published package in the release notes.

The replacement PR description will correct the earlier PR's history:
`fs-extra` 7 used vendored rimraf, not a `rimraf@2` dependency. Its three-retry
policy applied to asynchronous removal on all platforms with per-recursion
budgets. Synchronous removal used a Windows-only final-`rmdir` spin of up to
500 ms and could silently leave a folder behind when that spin expired.

## Verification and acceptance criteria

Extend the existing `FileSystem.test.ts` tests, retaining their existing
behavioral coverage while updating mocks to the new enumeration primitive.

Use mocked failures and mockable waits, not OS file locking, for deterministic
retry tests. Restore platform descriptors and mocks after every test.
Asynchronous cases must exercise actual promise rejection and pending
promises, not only synchronously thrown mocks.

Required cases:

- Each public method retries a recognized Windows failure and succeeds,
  passing both disabled native retry settings to each removal.
- Both helper paths exhaust four failed attempts with exactly
  `[100, 200, 300]` waits, propagate the final attempt's selected error by
  identity, and decorate only that selected error.
- Non-retryable/missing/unknown codes, a retryable failure followed by a
  non-retryable failure, and non-Windows failures cause no further retries.
- Emptying re-enumerates after partial deletion and handles enumeration and
  directory-creation failures using the same budget.
- Real filesystem cases cover existing/missing/empty folders, relative and
  unbound calls, nested contents, and preserving an existing file on failure.
- Async emptying never exceeds 10 started, pending top-level calls; stops
  starting new removals after observing a failure; and drains pending calls
  before both retries and final rejection.
- Mixed failures choose the first non-retryable error regardless of whether
  it occurs before or after a retryable failure, including on non-Windows
  platforms using code-only classification. All-transient failures preserve
  the first observed error within the final attempt.
- Async tests complete without unhandled rejections or leaked work.

Run the smallest combined Heft selection covering `FileSystem.test` and
`Async.test`, including compilation, linting, and API extraction. Verify
formatting and Rush change-file coverage. Use existing upstream CI for its
supported Linux/Windows Node.js matrix; investigate failures and distinguish
introduced failures from unrelated baseline failures.

## Review gates

1. Claude Opus 5.5 and GPT-5.3 Codex independently review this specification.
   Incorporate actionable feedback; present conflicting requirements or
   material design/scope decisions to the user. Obtain explicit approval
   from both reviewers on the same spec revision before implementation.
2. Open a replacement PR against `microsoft/rushstack` and close microsoft/rushstack#6231 with
   a link to its replacement, preserving the original commits.
3. Have both models independently review the complete replacement PR branch
   against this specification. Address findings and repeat review until both
   explicitly approve the same final commit. Ask the user to resolve genuine
   judgement calls rather than silently choosing between conflicting reviews.
