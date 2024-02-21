// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Explicitly use the colors package here instead of Colorize
import colors from 'colors/safe';
import { AnsiEscape } from '../AnsiEscape';

describe(AnsiEscape.name, () => {
  let initialColorsEnabled: boolean;

  beforeAll(() => {
    initialColorsEnabled = colors.enabled;
    colors.enable();
  });

  afterAll(() => {
    if (!initialColorsEnabled) {
      colors.disable();
    }
  });

  it('calls removeCodes() successfully', () => {
    const coloredInput: string = colors.rainbow('Hello, world!');
    const decoloredInput: string = AnsiEscape.removeCodes(coloredInput);
    expect(coloredInput).not.toBe(decoloredInput);
    expect(decoloredInput).toBe('Hello, world!');
  });
});
