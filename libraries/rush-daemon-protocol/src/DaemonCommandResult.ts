// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonRestartReason } from './DaemonInstallationChange';
import type { DaemonRequestAdmissionErrorCode } from './DaemonRequestAdmission';

/**
 * The semantic outcome of a daemon command.
 *
 * @beta
 */
export type DaemonCommandOutcome = 'success' | 'success-with-warning' | 'failure' | 'aborted';

/**
 * The authoritative final result delivered after a daemon command's output has drained.
 *
 * @beta
 */
export interface IDaemonCommandResult {
  /**
   * Protocol 0.10: no execution or request IO occurred, and a successor has been selected. With a
   * `restartReason` of `installationChanged`, the daemon exits without one instead, and the client starts it.
   * Retry only after attested predecessor ownership release, within the request's admission deadline and a
   * small client-defined retry bound; then fall back instead of retrying. Never infer this from an error.
   * The predecessor launches the selected successor itself after that release, and its process exits once the
   * launch settles: until then, a retrying client connects to the successor but must not start a daemon.
   */
  readonly retryAfterRestart?: true;
  /** Why the daemon restarts, when it says; only together with `retryAfterRestart`. Older daemons omit it. */
  readonly restartReason?: DaemonRestartReason;
  /** Whether cancellation or disconnect was observed, even if a cleanup failure determines the outcome. */
  readonly aborted: boolean;
  /** The typed admission failure, when execution never started. */
  readonly admissionErrorCode?: DaemonRequestAdmissionErrorCode;
  /** The process exit code a compatible in-process Rush invocation would return. */
  readonly exitCode: number;
  /** A failure description for execution or cleanup failures that were not already operation-scoped. */
  readonly errorMessage?: string;
  /** The semantic command outcome. */
  readonly outcome: DaemonCommandOutcome;
  /** The identifier copied from the request. */
  readonly requestId: string;
}
