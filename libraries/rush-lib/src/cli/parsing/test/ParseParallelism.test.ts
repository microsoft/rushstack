// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { parseParallelism } from '../ParseParallelism.ts';

describe(parseParallelism.name, () => {
  it('throwsErrorOnInvalidParallelism', () => {
    expect(() => parseParallelism('tequila')).toThrowErrorMatchingSnapshot();
  });

  it('createsWithPercentageBasedParallelism', () => {
    const value: number = parseParallelism('50%', 20);
    expect(value).toEqual(10);
  });

  it('throwsErrorOnInvalidParallelismPercentage', () => {
    expect(() => parseParallelism('200%')).toThrowErrorMatchingSnapshot();
  });
});
