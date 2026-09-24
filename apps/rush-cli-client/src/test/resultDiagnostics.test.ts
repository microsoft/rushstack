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

  it('prefers the typed admission failure', () => {
    expect(getResultDiagnostic({ exitCode: 1, admissionErrorCode: 'wait-timeout', errorMessage: 'x' })).toBe(
      'rush-client: daemon admission failed (wait-timeout).\n'
    );
  });

  it('stays silent for successful results and failures without a message', () => {
    expect(getResultDiagnostic({ exitCode: 0, errorMessage: 'ignored' })).toBeUndefined();
    expect(getResultDiagnostic({ exitCode: 1 })).toBeUndefined();
  });
});
