// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonCommandResult, IDaemonRequestAdmissionOptions } from '@rushstack/rush-daemon-protocol';

import { formatAdmissionFailure } from './ClientAdmissionControls';

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

/**
 * Returns the stderr text that explains a daemon result when no agent summary line explains it, if any.
 *
 * @remarks
 * An admission failure is explained with the daemon's reason when it sent one, so that the text names what
 * the request waited for, such as a daemon restart.
 */
export function getResultStderr(
  result: Pick<IDaemonCommandResult, 'admissionErrorCode' | 'errorMessage' | 'exitCode'>,
  admission: IDaemonRequestAdmissionOptions | undefined
): string | undefined {
  const diagnostic: string | undefined = getResultDiagnostic(result);
  if (diagnostic || !result.admissionErrorCode) return diagnostic;
  return formatAdmissionFailure(result.admissionErrorCode, admission, result.errorMessage);
}
