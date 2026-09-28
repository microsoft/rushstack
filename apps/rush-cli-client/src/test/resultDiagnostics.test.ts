// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getResultDiagnostic, getResultStderr } from '../resultDiagnostics';

describe(getResultDiagnostic.name, () => {
  it('prints the error message of a failed result', () => {
    expect(
      getResultDiagnostic({
        exitCode: 1,
        errorMessage: 'The Rush daemon was shut down (idle timeout) while this request was running.'
      })
    ).toBe('rush-client: The Rush daemon was shut down (idle timeout) while this request was running.\n');
  });

  it('prefers the reason of a request aborted while waiting for admission', () => {
    expect(
      getResultDiagnostic({ exitCode: 1, admissionErrorCode: 'aborted', errorMessage: 'daemon shut down' })
    ).toBe('rush-client: daemon shut down\n');
  });

  it('leaves no-wait and wait-timeout admission failures to the admission formatter', () => {
    expect(
      getResultDiagnostic({ exitCode: 1, admissionErrorCode: 'wait-timeout', errorMessage: 'x' })
    ).toBeUndefined();
    expect(
      getResultDiagnostic({ exitCode: 1, admissionErrorCode: 'no-wait', errorMessage: 'x' })
    ).toBeUndefined();
    expect(getResultDiagnostic({ exitCode: 1, admissionErrorCode: 'aborted' })).toBeUndefined();
  });

  it('stays silent for successful results and failures without a message', () => {
    expect(getResultDiagnostic({ exitCode: 0, errorMessage: 'ignored' })).toBeUndefined();
    expect(getResultDiagnostic({ exitCode: 1 })).toBeUndefined();
  });
});

describe(getResultStderr.name, () => {
  it("explains an admission failure with the daemon's reason", () => {
    const reason: string =
      "The rushx script was not admitted before the daemon could restart for another request's environment. " +
      'Use --wait-timeout <seconds> to wait longer.';
    expect(
      getResultStderr(
        { exitCode: 1, admissionErrorCode: 'wait-timeout', errorMessage: reason },
        { waitTimeoutMs: 5000 }
      )
    ).toBe(`rush-client: daemon admission failed (wait-timeout): ${reason}\n`);
  });

  it('falls back to the generic admission explanation without a reason', () => {
    expect(
      getResultStderr({ exitCode: 1, admissionErrorCode: 'wait-timeout' }, { waitTimeoutMs: 5000 })
    ).toContain('timed out after its 5s wait timeout waiting for another daemon request');
  });

  it('keeps the diagnostic of other failures and stays silent on success', () => {
    expect(
      getResultStderr(
        { exitCode: 1, admissionErrorCode: 'aborted', errorMessage: 'daemon shut down' },
        undefined
      )
    ).toBe('rush-client: daemon shut down\n');
    expect(getResultStderr({ exitCode: 0 }, undefined)).toBeUndefined();
  });
});
