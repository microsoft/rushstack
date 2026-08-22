// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS,
  validateDaemonRequestAdmissionOptions
} from '../DaemonRequestAdmission';

const OUT_OF_RANGE_INCREMENT: number = 1;

describe(validateDaemonRequestAdmissionOptions.name, () => {
  it('accepts omitted and bounded admission options', () => {
    expect(() => validateDaemonRequestAdmissionOptions(undefined)).not.toThrow();
    expect(() =>
      validateDaemonRequestAdmissionOptions({
        noWait: true,
        waitTimeoutMs: MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS
      })
    ).not.toThrow();
  });

  it.each([
    [{ noWait: 'yes' }, 'noWait'],
    [{ waitTimeoutMs: -1 }, 'waitTimeoutMs'],
    [{ waitTimeoutMs: 1.5 }, 'waitTimeoutMs'],
    [
      { waitTimeoutMs: MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS + OUT_OF_RANGE_INCREMENT },
      'waitTimeoutMs'
    ]
  ])('rejects invalid options %#', (options: object, expectedMessage: string) => {
    expect(() =>
      validateDaemonRequestAdmissionOptions(options as never)
    ).toThrow(expectedMessage);
  });
});
