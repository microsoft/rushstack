// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

describe('index.test', () => {
  it.each(new Array(100).fill(0))('should succeed', async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(1 + 1).toEqual(2);
  });
});
