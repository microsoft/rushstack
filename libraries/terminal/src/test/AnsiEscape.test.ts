// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AnsiEscape } from '../AnsiEscape.ts';
import { Colorize } from '../Colorize.ts';

describe(AnsiEscape.name, () => {
  it('calls removeCodes() successfully', () => {
    const coloredInput: string = Colorize.rainbow('Hello, world!');
    const decoloredInput: string = AnsiEscape.removeCodes(coloredInput);
    expect(coloredInput).not.toBe(decoloredInput);
    expect(decoloredInput).toBe('Hello, world!');
  });
});
