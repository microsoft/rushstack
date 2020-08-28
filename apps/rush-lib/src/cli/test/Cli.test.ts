// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { Utilities } from '../../utilities/Utilities';

describe('CLI', () => {
  it('should not fail when there is no rush.json', () => {
    const workingDir: string = '/';
    const startPath: string = path.resolve(path.join(__dirname, '../../../lib/start.js'));

    expect(() => {
      Utilities.executeCommand({
        command: 'node',
        args: [startPath],
        workingDirectory: workingDir,
        suppressOutput: true
      });
    }).not.toThrow();
  });

  it('rushx should pass args to scripts', () => {
    // Invoke "rushx"
    const startPath: string = path.resolve(path.join(__dirname, '../../../lib/startx.js'));

    // Run "rushx show-args 1 2 -x" in the "repo/rushx-project" folder
    const output: string = Utilities.executeCommandAndCaptureOutput(
      'node',
      [startPath, 'show-args', '1', '2', '-x'],
      path.join(__dirname, 'repo', 'rushx-project')
    );
    const lastLine: string =
      output
        .split(/\s*\n\s*/)
        .filter((x) => x)
        .pop() || '';
    expect(lastLine).toEqual('build.js: ARGS=["1","2","-x"]');
  });
});
