// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import { AnsiEscape } from '../AnsiEscape';

describe('AnsiEscape', () => {
  test('calls removeCodes() successfully', () => {
    const oldEnabled: boolean = colors.enabled;
    colors.enable();

    const coloredInput: string = colors.rainbow('Hello, world!');
    const decoloredInput: string = AnsiEscape.removeCodes(coloredInput);
    expect(coloredInput).not.toBe(decoloredInput);
    expect(decoloredInput).toBe('Hello, world!');

    if (!oldEnabled) {
      colors.disable();
    }
  });
});
