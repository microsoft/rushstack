// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// TODO(reconcile): align with `@rushstack/reporter`'s payload vocabulary once
// that package merges into main (#5858).

/**
 * Payload of an `operationRegistered` event: one operation known to the engine.
 *
 * @beta
 */
export interface IDaemonOperationRegisteredPayload {
  /** The operation identifier (also the display name today). */
  readonly operationId: string;
  /** Whether the operation is silent (excluded from progress totals). */
  readonly silent?: boolean;
}

/**
 * Payload of an `operationStatusChanged` event.
 *
 * @remarks
 * `status` carries the engine's raw status string (for example `SUCCESS` or
 * `FAILURE`) so no information is lost versus the legacy colorized text.
 *
 * @beta
 */
export interface IDaemonOperationStatusChangedPayload {
  /** The operation whose status changed. */
  readonly operationId: string;
  /** The new raw engine status string. */
  readonly status: string;
  /** The previous raw engine status string, when known. */
  readonly previousStatus?: string;
  /**
   * The absolute path of the operation's full text log, when the operation failed or succeeded with
   * warnings and wrote a log. Clients that summarize output print it so the full output can be read later.
   */
  readonly logFilePath?: string;
  /**
   * Which of the operation's commands produced the status, when the operation failed or succeeded with
   * warnings and has an incremental command (a `<phase>:incremental` script) besides its initial command.
   * An incremental command can fail where the initial command would not, so clients that summarize output
   * say when it ran.
   */
  readonly commandKind?: 'initial' | 'incremental';
}

/**
 * Payload of an `activityChanged` event: a human-oriented status line.
 *
 * @beta
 */
export interface IDaemonActivityPayload {
  /** The activity text (for example the summary lines). */
  readonly text: string;
  /** The stream the line was written to. Defaults to `stdout`. */
  readonly stream?: 'stdout' | 'stderr';
  /**
   * Set when Rush or a Rush plugin wrote the text as a warning or an error while the engine loaded or ran,
   * which native Rush prints in yellow or red. Absent on other activity, including the end-of-run summary.
   * Clients that print only a summary can still show these lines.
   */
  readonly severity?: 'warning' | 'error';
}
