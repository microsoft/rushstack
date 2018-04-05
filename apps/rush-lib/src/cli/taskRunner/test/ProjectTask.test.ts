// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// <reference types='mocha' />
import { assert } from 'chai';

import { convertSlashesForWindows } from '../ProjectTask';

describe('convertSlashesForWindows()', () => {
  it('converted inputs', () => {
    assert.equal(convertSlashesForWindows('/blah/bleep&&/bloop'), '\\blah\\bleep&&/bloop');
    assert.equal(convertSlashesForWindows('/blah/bleep'), '\\blah\\bleep');
    assert.equal(convertSlashesForWindows('/blah/bleep --path a/b'), '\\blah\\bleep --path a/b');
  });
  it('ignored inputs', () => {
    assert.equal(convertSlashesForWindows('C:\\blah/bleep && /bloop'), 'C:\\blah/bleep && /bloop');
    assert.equal(convertSlashesForWindows('"/blah/bleep"'), '"/blah/bleep"');
  });
});