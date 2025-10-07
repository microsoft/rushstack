// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import image from '../chunks/image.png';

describe('Image Test', () => {
  it('correctly handles urls for images', () => {
    expect(image).toBe('lib-commonjs/chunks/image.png');
  });
});
