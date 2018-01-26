// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types='mocha' />

import * as path from 'path';
import { assert } from 'chai';

import Utilities from '../../utilities/Utilities';

describe('CLI', function() {
  this.timeout(15000);
  it('should not fail when there is no rush.json', () => {
    const workingDir: string = '/';
    const startPath: string = path.resolve(path.join(__dirname, '../../start.js'));

    assert.doesNotThrow(() => {
      Utilities.executeCommand('node', [ startPath ], workingDir, true);
    }, 'rush -h is broken');
  });
});
