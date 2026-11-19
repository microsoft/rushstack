// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getErrorExitCode } from '../CliUtilities';

describe(getErrorExitCode.name, () => {
  const cases: [string | number | undefined, number][] = [
    [undefined, 1],
    [0, 1],
    ['0', 1],
    ['', 1],
    [-1, 1],
    [1.5, 1],
    ['abc', 1],
    [1, 1],
    [2, 2],
    ['3', 3]
  ];

  it.each(cases)(
    'maps an exit code of %p to %p',
    (exitCode: string | number | undefined, expected: number) => {
      expect(getErrorExitCode(exitCode)).toBe(expected);
    }
  );
});
