// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ChildProcess } from 'node:child_process';
import { Executable } from '@rushstack/node-core-library';
import { ensureHelpTextMatchesSnapshot } from './helpTestUtilities.ts';

const TEST_CLI_PATH: string = `${__dirname}/test-cli/start`;

function runTestCliTestWithArgs(testName: string, args: string[]): void {
  it(testName, async () => {
    const testCliProcess: ChildProcess = Executable.spawn(process.argv0, [TEST_CLI_PATH, ...args], {
      stdio: 'pipe'
    });
    const { stdout, stderr, exitCode, signal } = await Executable.waitForExitAsync(testCliProcess, {
      encoding: 'utf8'
    });

    expect(stdout).toMatchSnapshot('process stdout');
    expect(stderr).toMatchSnapshot('process stderr');
    expect(exitCode).toMatchSnapshot('process exit code');
    expect(signal).toMatchSnapshot('process signal');
  });
}

describe('end-to-end test', () => {
  beforeEach(() => {
    // ts-command-line calls process.exit() which interferes with Jest
    jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`Test code called process.exit(${code})`);
    });
  });

  it(`prints the help`, async () => {
    const { WidgetCommandLine } = await import('./test-cli/WidgetCommandLine.ts');

    const parser = new WidgetCommandLine();

    ensureHelpTextMatchesSnapshot(parser);
  });

  describe('execution tests', () => {
    runTestCliTestWithArgs('with no args', []);
    runTestCliTestWithArgs('run', ['run']);
    runTestCliTestWithArgs('run --title My Title', ['run', '--title', 'My Title']);
    runTestCliTestWithArgs('run --title My Title --remaining --args', [
      'run',
      '--title',
      'My Title',
      '--remaining',
      '--args'
    ]);
    runTestCliTestWithArgs('push', ['push']);
    runTestCliTestWithArgs('push --force', ['push', '--force']);
    runTestCliTestWithArgs('push --protocol ftp', ['push', '--protocol', 'ftp']);
    runTestCliTestWithArgs('push --protocol bogus', ['push', '--protocol', 'bogus']);
  });
});
