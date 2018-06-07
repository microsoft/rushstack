// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types='mocha' />

import { Text } from '../Text';
import { assert } from 'chai';

describe('Text', () => {
  it('Text.padEnd()', () => {
    assert.equal(Text.padEnd('', 5),        '     ');
    assert.equal(Text.padEnd('123', 5),     '123  ');
    assert.equal(Text.padEnd('12345', 5),   '12345');
    assert.equal(Text.padEnd('123456', 5),  '123456');
  });
  it('Text.truncateWithEllipsis()', () => {
    assert.equal(Text.truncateWithEllipsis('', 2),        '');
    assert.equal(Text.truncateWithEllipsis('1', 2),       '1');
    assert.equal(Text.truncateWithEllipsis('12', 2),      '12');
    assert.equal(Text.truncateWithEllipsis('123', 2),     '12');

    assert.equal(Text.truncateWithEllipsis('123', 5),     '123');
    assert.equal(Text.truncateWithEllipsis('1234', 5),    '1234');
    assert.equal(Text.truncateWithEllipsis('12345', 5),   '12345');
    assert.equal(Text.truncateWithEllipsis('123456', 5),  '12...');
  });
});
