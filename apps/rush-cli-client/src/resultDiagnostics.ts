// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonCommandResult } from '@rushstack/rush-daemon-protocol';

/**
 * Returns the stderr line that explains a failed daemon result, if any.
 *
 * @remarks
 * A non-zero result's error message (for example, a daemon shutdown that aborted the request) is the only
 * place the daemon reports failures that are not attributed to an operation, so it must not be dropped.
 * Returns `undefined` for `no-wait` and `wait-timeout` admission failures, which `formatAdmissionFailure`
 * explains.
 */
export function getResultDiagnostic(
  result: Pick<IDaemonCommandResult, 'admissionErrorCode' | 'errorMessage' | 'exitCode'>
): string | undefined {
  // A request aborted while waiting for admission carries the reason (such as a daemon shutdown) in its
  // error message; other admission failures are explained by `formatAdmissionFailure`.
  if (result.admissionErrorCode !== undefined && result.admissionErrorCode !== 'aborted') return undefined;
  if (result.exitCode !== 0 && result.errorMessage) {
    return `rush-client: ${result.errorMessage}\n`;
  }
  return undefined;
}
