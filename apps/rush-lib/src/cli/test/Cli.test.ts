// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { Utilities } from '../../utilities/Utilities';

describe('CLI', () => {
  it('should not fail when there is no rush.json', () => {
    const workingDir: string = '/';
    const startPath: string = path.resolve(path.join(__dirname, '../../start.js'));

    expect(() => {
      Utilities.executeCommand('node', [startPath], workingDir, undefined, true);
    }).not.toThrow();
  });
});
