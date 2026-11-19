// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { DeferredCacheEntryWrites } from '@microsoft/rush-lib/lib/logic/buildCache/DeferredCacheEntryWrites';
import {
  DaemonFrameType,
  decodeDaemonEventFrame,
  decodeDaemonLogChunk,
  type IDaemonEventEnvelope
} from '@rushstack/rush-daemon-protocol';

import type { ITerminalExchange } from './DaemonRequestWireTestUtilities';
import { createFixtureAsync, runAsync, runs, type IFixture } from './NativeEngineTestFixture';

// Each test runs several builds, which can take longer than Jest's default 5 seconds on a busy machine.
jest.setTimeout(30_000);

const SEALED: RegExp =
  /Sealed \d+ output files? \(0\.0 MB\) in \d+ ms; writing the build cache entry in the background\./;
const NOT_CLONED: RegExp =
  /Unable to clone the output files \([A-Z]+\), so the build cache entry is written now\./;
const REPORT: RegExp =
  /Build cache entries written in the background since the previous command: 1 queued, (0 written \(0\.0 MB\), 0 failed; 1 pending|1 written \(0\.0 MB\), 0 failed; 0 pending)\./;
const WRITTEN: string = 'Successfully set cache entry';

/** The text of a request's output, from its operations' logs and from its own terminal. */
function requestOutput(exchange: ITerminalExchange): string {
  let text: string = '';
  for (const frame of exchange.frames) {
    if (frame.kind === DaemonFrameType.event) {
      const event: IDaemonEventEnvelope = decodeDaemonEventFrame(frame.payload);
      if (event.type === 'activityChanged') {
        text += (event.payload as { text?: string }).text ?? '';
      }
    } else if (frame.kind === DaemonFrameType.logStdout || frame.kind === DaemonFrameType.logStderr) {
      text += Buffer.from(decodeDaemonLogChunk(frame.payload).chunk).toString();
    }
  }
  return text;
}

// Whether the file system of the folder can clone files, as the background writes need
function canCloneFiles(folderPath: string): boolean {
  const sourcePath: string = path.join(folderPath, 'clone-probe');
  fs.writeFileSync(sourcePath, 'probe');
  try {
    fs.copyFileSync(sourcePath, `${sourcePath}-clone`, fs.constants.COPYFILE_FICLONE_FORCE);
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(sourcePath, { force: true });
    fs.rmSync(`${sourcePath}-clone`, { force: true });
  }
}

describe('build cache entries of daemon builds', () => {
  it('are written in the background with the deferCacheWrites setting', async () => {
    const fixture: IFixture = await createFixtureAsync(true, 'direct', { deferCacheWrites: true });
    try {
      const cloned: boolean = canCloneFiles(path.join(fixture.repoRoot, 'common/temp'));
      const initial: ITerminalExchange = await runAsync(fixture, 'initial', ['build', '--only', 'a']);
      expect(initial.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      // Without clones, the entry is written before the operation completes, as without the setting.
      const output: string = requestOutput(initial);
      expect(output).toMatch(cloned ? SEALED : NOT_CLONED);
      expect(output.includes(WRITTEN)).toBe(!cloned);
      expect(REPORT.test(output)).toBe(cloned);
      await DeferredCacheEntryWrites.instance.waitForIdleAsync();

      fs.writeFileSync(path.join(fixture.repoRoot, 'projects/a/input.txt'), 'two');
      await runAsync(fixture, 'changed', ['build', '--only', 'a']);
      fs.writeFileSync(path.join(fixture.repoRoot, 'projects/a/input.txt'), 'one');
      expect((await runAsync(fixture, 'cached', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, operationResults: [{ status: 'FROM CACHE' }] }
      });
      expect(runs(fixture)).toEqual(['a:one:', 'a:two:']);
      expect(fs.readFileSync(path.join(fixture.repoRoot, 'projects/a/lib/output.txt'), 'utf8')).toBe('one');
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('are written before their operations complete without the setting', async () => {
    const fixture: IFixture = await createFixtureAsync(true);
    try {
      const initial: ITerminalExchange = await runAsync(fixture, 'initial', ['build', '--only', 'a']);
      expect(initial.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      const output: string = requestOutput(initial);
      expect(output).toContain(WRITTEN);
      expect(output).not.toMatch(/Sealed|Unable to clone|in the background/);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });
});
