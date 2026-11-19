// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@microsoft/rush-lib', () => {
  const actual: typeof import('@microsoft/rush-lib') = jest.requireActual('@microsoft/rush-lib');
  return {
    ...actual,
    captureProjectConfigurationFingerprintAsync: jest.fn(actual.captureProjectConfigurationFingerprintAsync)
  };
});

import * as fs from 'node:fs';
import * as path from 'node:path';

import * as rushLib from '@microsoft/rush-lib';

import { DaemonGraphTestFixture, withScriptDeadline } from './DaemonGraphTestFixture';
import { createDeferred, type IDeferred, type ITerminalExchange } from './DaemonRequestWireTestUtilities';

jest.setTimeout(60_000);

const BUILD_A: string[] = ['build', '--to', 'a', '--parallelism', '3'];
/** Longer than the wait timeout, so that a request whose capture counted would have none left. */
const CAPTURE_MS: number = 2_500;
const WAIT_TIMEOUT_MS: number = 2_000;
const captureMock: jest.MockedFunction<typeof rushLib.captureProjectConfigurationFingerprintAsync> =
  jest.mocked(rushLib.captureProjectConfigurationFingerprintAsync);

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

async function createFixtureAsync(): Promise<DaemonGraphTestFixture> {
  return await DaemonGraphTestFixture.createAsync((created) => {
    created.write('.gitignore', 'common/temp/\n**/.rush/\n**/rush-logs/\nruns.txt\nrelease-a\n');
    created.write(
      'a/build.cjs',
      withScriptDeadline(
        "const fs=require('node:fs');fs.appendFileSync('../runs.txt','a\\n');" +
          "const wait=()=>fs.existsSync('../release-a')?console.log('finished-a'):setTimeout(wait,20);wait();"
      )
    );
  });
}

/** Makes the next project configuration capture, which a warm build runs before it is routed, take `CAPTURE_MS`. */
function slowDownNextCapture(): IDeferred<void> {
  const captured: IDeferred<void> = createDeferred<void>();
  const actual: typeof rushLib.captureProjectConfigurationFingerprintAsync =
    jest.requireActual<typeof rushLib>('@microsoft/rush-lib').captureProjectConfigurationFingerprintAsync;
  captureMock.mockClear();
  captureMock.mockImplementationOnce(async (...args) => {
    await delayAsync(CAPTURE_MS);
    try {
      return await actual(...args);
    } finally {
      captured.resolve();
    }
  });
  return captured;
}

describe('explicit wait timeouts and a request preparing to run', () => {
  it('does not spend the timeout on capturing the request inputs, so the request can still wait', async () => {
    const fixture: DaemonGraphTestFixture = await createFixtureAsync();
    const releaseFile: string = path.join(fixture.folder, 'release-a');
    try {
      const long: Promise<ITerminalExchange> = fixture.runAsync(BUILD_A);
      await waitForAsync(() => fixture.runs().includes('a'), 'the long build to start');

      const captured: IDeferred<void> = slowDownNextCapture();
      const behind: Promise<ITerminalExchange> = fixture.runAsync(BUILD_A, {
        admission: { waitTimeoutMs: WAIT_TIMEOUT_MS }
      });
      await captured.promise;
      // The request now waits for the running build, which ends well within its timeout.
      await delayAsync(200);
      fs.writeFileSync(releaseFile, '');

      expect((await long).terminal).toMatchObject({ payload: { exitCode: 0 } });
      expect((await behind).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      expect(captureMock).toHaveBeenCalledTimes(1);
    } finally {
      // A failed expectation must not leave the long build running, which would keep the fixture from shutting down.
      fs.writeFileSync(releaseFile, '');
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('still spends the timeout while the request waits after capturing its inputs', async () => {
    const fixture: DaemonGraphTestFixture = await createFixtureAsync();
    const releaseFile: string = path.join(fixture.folder, 'release-a');
    try {
      const long: Promise<ITerminalExchange> = fixture.runAsync(BUILD_A);
      await waitForAsync(() => fixture.runs().includes('a'), 'the long build to start');

      const captured: IDeferred<void> = slowDownNextCapture();
      const startedAt: number = Date.now();
      const behind: Promise<ITerminalExchange> = fixture.runAsync(BUILD_A, {
        admission: { waitTimeoutMs: WAIT_TIMEOUT_MS }
      });
      await captured.promise;
      const timedOut: ITerminalExchange = await behind;
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(CAPTURE_MS + WAIT_TIMEOUT_MS - 100);
      expect(timedOut.terminal).toMatchObject({
        kind: 'requestResult',
        payload: {
          exitCode: 1,
          admissionErrorCode: 'wait-timeout',
          errorMessage:
            `The request was not admitted within its ${WAIT_TIMEOUT_MS}ms wait timeout while waiting for the ` +
            'running build of the workspace operation graph. Use --wait-timeout <seconds> to wait longer.'
        }
      });

      fs.writeFileSync(releaseFile, '');
      expect((await long).terminal).toMatchObject({ payload: { exitCode: 0 } });
    } finally {
      fs.writeFileSync(releaseFile, '');
      await fixture[Symbol.asyncDispose]();
    }
  });
});
