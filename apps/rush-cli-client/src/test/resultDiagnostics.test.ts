// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getResultDiagnostic } from '../resultDiagnostics';

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
