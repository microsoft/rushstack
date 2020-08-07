// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ChunkClass } from '../chunks/ChunkClass';

describe('Example Test', () => {
  it('Correctly tests stuff', () => {
    expect(true).toBeTruthy();
  });

  it('Correctly handles images', () => {
    const chunkClass: ChunkClass = new ChunkClass();
    expect(() => chunkClass.getImageUrl()).not.toThrow();
    expect(typeof chunkClass.getImageUrl()).toBe('string');
  });
});
