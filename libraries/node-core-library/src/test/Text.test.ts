// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Text } from '../Text';

describe('Text', () => {
  it('Text.padEnd()', () => {
    expect(Text.padEnd('', 5)).toEqual(      '     ');
    expect(Text.padEnd('123', 5)).toEqual(   '123  ');
    expect(Text.padEnd('12345', 5)).toEqual( '12345');
    expect(Text.padEnd('123456', 5)).toEqual('123456');
  });
  it('Text.truncateWithEllipsis()', () => {
    expect(() => {
      Text.truncateWithEllipsis('123', -1);
    }).toThrow();
    expect(Text.truncateWithEllipsis('123', 0)).toEqual(   '');

    expect(Text.truncateWithEllipsis('', 2)).toEqual(      '');
    expect(Text.truncateWithEllipsis('1', 2)).toEqual(     '1');
    expect(Text.truncateWithEllipsis('12', 2)).toEqual(    '12');
    expect(Text.truncateWithEllipsis('123', 2)).toEqual(   '12');

    expect(Text.truncateWithEllipsis('123', 5)).toEqual(   '123');
    expect(Text.truncateWithEllipsis('1234', 5)).toEqual(  '1234');
    expect(Text.truncateWithEllipsis('12345', 5)).toEqual( '12345');
    expect(Text.truncateWithEllipsis('123456', 5)).toEqual('12...');
  });
});
