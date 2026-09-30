// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'node:child_process';
import type { Readable } from 'node:stream';

import { FIXTURE_SCRIPT_DEADLINE_MS, withScriptDeadline } from './DaemonGraphTestFixture';

jest.setTimeout(30_000);

interface IScriptExit {
  readonly exitCode: number | undefined;
  readonly signal: string | undefined;
  readonly stdout: string;
  readonly stderr: string;
  readonly elapsedMs: number;
}

function runScriptAsync(script: string): Promise<IScriptExit> {
  const start: number = Date.now();
  return new Promise((resolve, reject) => {
    const child: childProcess.ChildProcessByStdio<null, Readable, Readable> = childProcess.spawn(
      process.execPath,
      ['-e', script],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout: string = '';
    let stderr: string = '';
    child.stdout.setEncoding('utf8').on('data', (text: string) => (stdout += text));
    child.stderr.setEncoding('utf8').on('data', (text: string) => (stderr += text));
    child.on('error', reject);
    child.on('close', (code, signal) =>
      resolve({
        exitCode: code ?? undefined,
        signal: signal ?? undefined,
        stdout,
        stderr,
        elapsedMs: Date.now() - start
      })
    );
  });
}

describe(withScriptDeadline.name, () => {
  it('ends a script that its test never released, with exit code 1 and one stderr line', async () => {
    // Without the deadline, the script's own backstop would end it with exit code 7 after 10 s.
    const result: IScriptExit = await runScriptAsync(
      withScriptDeadline('setInterval(()=>{},20);setTimeout(()=>process.exit(7),10_000);', 300)
    );
    expect(result).toMatchObject({
      exitCode: 1,
      signal: undefined,
      stdout: '',
      stderr: 'fixture script: its test did not release it within 300 ms\n'
    });
    expect(result.elapsedMs).toBeGreaterThanOrEqual(300);
  });

  it('lets a script that its test released exit as soon as it finishes', async () => {
    const result: IScriptExit = await runScriptAsync(
      withScriptDeadline("setTimeout(()=>console.log('released'),50);", 20_000)
    );
    expect(result).toMatchObject({ exitCode: 0, signal: undefined, stdout: 'released\n', stderr: '' });
    expect(result.elapsedMs).toBeLessThan(10_000);
  });

  it('outlasts the 60 s timeout of the tests that use it, by default', () => {
    expect(FIXTURE_SCRIPT_DEADLINE_MS).toBeGreaterThan(60_000);
    expect(withScriptDeadline('wait();')).toMatch(
      new RegExp(`,${FIXTURE_SCRIPT_DEADLINE_MS}\\)\\.unref\\(\\);wait\\(\\);$`)
    );
  });

  it('rejects a deadline that is not a positive whole number of milliseconds', () => {
    for (const deadlineMs of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => withScriptDeadline('wait();', deadlineMs)).toThrow(RangeError);
    }
  });
});
