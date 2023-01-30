// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { Utilities } from '../../utilities/Utilities';

describe('CLI', () => {
  it('should not fail when there is no rush.json', () => {
    const workingDir: string = '/';
    const startPath: string = path.resolve(__dirname, '../../../lib-commonjs/start.js');

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
    const startPath: string = path.resolve(__dirname, '../../../lib-commonjs/startx.js');

    // Run "rushx show-args 1 2 -x" in the "repo/rushx-project" folder
    const output: string = Utilities.executeCommandAndCaptureOutput(
      'node',
      [startPath, 'show-args', '1', '2', '-x'],
      `${__dirname}/repo/rushx-project`
    );
    const lastLine: string =
      output
        .split(/\s*\n\s*/)
        .filter((x) => x)
        .pop() || '';
    expect(lastLine).toEqual('build.js: ARGS=["1","2","-x"]');
  });

  it('rushx should fail in un-rush project', () => {
    // Invoke "rushx"
    const startPath: string = path.resolve(__dirname, '../../../lib-commonjs/startx.js');

    const output = Utilities.executeCommandAndCaptureOutput(
      'node',
      [startPath, 'show-args', '1', '2', '-x'],
      `${__dirname}/repo/rushx-not-in-rush-project`
    );

    console.log(output);

    expect(output).toEqual(
      expect.stringMatching(
        'Warning: You are invoking "rushx" inside a Rush repository, but this project is not registered in rush.json.'
      )
    );
  });
});
