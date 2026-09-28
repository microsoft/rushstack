// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { IDaemonRequestAdmissionOptions } from '@rushstack/rush-daemon-protocol';

import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';
import { createDeferred, type IDeferred, type ITerminalExchange } from './DaemonRequestWireTestUtilities';

jest.setTimeout(60_000);

const BUILD_A: string[] = ['build', '--to', 'a', '--parallelism', '3'];
const BUILD_B: string[] = ['build', '--to', 'b', '--parallelism', '3'];
const DEFAULT_BUDGET: IDaemonRequestAdmissionOptions = { waitTimeoutMs: 300, waitTimeoutIsDefault: true };

function delayAsync(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitForAsync(predicate: () => boolean, description: string): Promise<void> {
  const deadline: number = Date.now() + 30_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}.`);
    await delayAsync(20);
  }
}

function expectSuccess(exchange: ITerminalExchange): void {
  expect(exchange.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
}

function expectWaitTimeout(exchange: ITerminalExchange): void {
  expect(exchange.terminal).toMatchObject({
    kind: 'requestResult',
    payload: { exitCode: 1, admissionErrorCode: 'wait-timeout' }
  });
}

describe('workspace admission behind a graph transition', () => {
  it('admits builds that arrive while another build loads the graph without spending their default budget', async () => {
    const fixture: DaemonGraphTestFixture = await DaemonGraphTestFixture.createAsync();
    try {
      const loadStarted: IDeferred<void> = createDeferred<void>();
      const releaseLoad: IDeferred<void> = createDeferred<void>();
      fixture.beforeCreateSessionAsync = async () => {
        loadStarted.resolve();
        await releaseLoad.promise;
      };
      const first: Promise<ITerminalExchange> = fixture.runAsync(BUILD_B);
      await loadStarted.promise;

      const withDefaultBudget: Promise<ITerminalExchange> = fixture.runAsync(BUILD_B, {
        admission: DEFAULT_BUDGET
      });
      const withExplicitBudget: ITerminalExchange = await fixture.runAsync(BUILD_B, {
        admission: { waitTimeoutMs: 300 }
      });
      expectWaitTimeout(withExplicitBudget);
      await delayAsync(600);

      fixture.beforeCreateSessionAsync = undefined;
      releaseLoad.resolve();
      expectSuccess(await first);
      expectSuccess(await withDefaultBudget);
      expect(fixture.runs()).toEqual(['a', 'b']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('keeps a graph-gate waiter default budget for its reload after an input change', async () => {
    const fixture: DaemonGraphTestFixture = await DaemonGraphTestFixture.createAsync((created) => {
      created.write('.gitignore', 'common/temp/\n**/.rush/\n**/rush-logs/\nruns.txt\nrelease-a\n');
      created.write(
        'a/build.cjs',
        "const fs=require('node:fs');fs.appendFileSync('../runs.txt','a\\n');" +
          "const wait=()=>fs.existsSync('../release-a')?console.log('finished-a'):setTimeout(wait,20);wait();"
      );
    });
    const releaseFile: string = path.join(fixture.folder, 'release-a');
    try {
      const long: Promise<ITerminalExchange> = fixture.runAsync(BUILD_A);
      await waitForAsync(() => fixture.runs().includes('a'), 'the long build to start');

      // Reuses the generation, then waits at the graph-execution gate, which a default budget does not limit.
      const graphGateWaiter: Promise<ITerminalExchange> = fixture.runAsync(BUILD_A, {
        admission: DEFAULT_BUDGET
      });
      await delayAsync(500);
      const packageJsonPath: string = path.join(fixture.folder, 'c/package.json');
      const packageJson: Record<string, unknown> = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      fs.writeFileSync(packageJsonPath, JSON.stringify({ ...packageJson, description: 'changed' }));

      // Needs a reload, so it waits for exclusive admission until the long build ends.
      const reload: Promise<ITerminalExchange> = fixture.runAsync(BUILD_A);
      await delayAsync(500);
      // A reload that cannot start is not progress, so a default budget behind it is still spent.
      expectWaitTimeout(await fixture.runAsync(BUILD_A, { admission: DEFAULT_BUDGET }));

      fs.writeFileSync(releaseFile, '');
      expectSuccess(await long);
      expectSuccess(await reload);
      // The waiter's batch finds the changed input and re-enters admission behind the reload.
      expectSuccess(await graphGateWaiter);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });
});
