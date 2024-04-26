// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { add } from '..';

describe('othertests', () => {
  it.each(new Array(100).fill(0))('should succeed', async (i) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(add(1, 1)).toEqual(2);
  });
});
