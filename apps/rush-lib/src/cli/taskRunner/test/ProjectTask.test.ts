// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// <reference types='mocha' />
import { assert } from 'chai';

import { convertSlashesForWindows } from '../ProjectTask';

describe('convertSlashesForWindows()', () => {
  it('converted inputs', () => {
    assert.equal(convertSlashesForWindows('./node_modules/.bin/tslint -c config/tslint.json'),
      '.\\node_modules\\.bin\\tslint -c config/tslint.json');
    assert.equal(convertSlashesForWindows('/blah/bleep&&/bloop'), '\\blah\\bleep&&/bloop');
    assert.equal(convertSlashesForWindows('/blah/bleep'), '\\blah\\bleep');
    assert.equal(convertSlashesForWindows('/blah/bleep --path a/b'), '\\blah\\bleep --path a/b');
    assert.equal(convertSlashesForWindows('/blah/bleep>output.log'), '\\blah\\bleep>output.log');
    assert.equal(convertSlashesForWindows('/blah/bleep<input.json'), '\\blah\\bleep<input.json');
    assert.equal(convertSlashesForWindows('/blah/bleep|/blah/bloop'), '\\blah\\bleep|/blah/bloop');
  });
  it('ignored inputs', () => {
    assert.equal(convertSlashesForWindows('/blah\\bleep && /bloop'), '/blah\\bleep && /bloop');
    assert.equal(convertSlashesForWindows('cmd.exe /c blah'), 'cmd.exe /c blah');
    assert.equal(convertSlashesForWindows('"/blah/bleep"'), '"/blah/bleep"');
  });
});
