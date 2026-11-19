// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@microsoft/rush-lib', () => {
  const actual: typeof import('@microsoft/rush-lib') = jest.requireActual('@microsoft/rush-lib');
  return {
    ...actual,
    captureProjectConfigurationFingerprintAsync: jest.fn(actual.captureProjectConfigurationFingerprintAsync),
    captureWorkspaceInputFingerprintAsync: jest.fn(actual.captureWorkspaceInputFingerprintAsync)
  };
});

import * as rushLib from '@microsoft/rush-lib';

import { FreshCaptureCoalescer } from '../FreshCaptureCoalescer';
import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';
import { setDaemonPolicy } from './WarmGenerationTestUtilities';

jest.setTimeout(60_000);

const WAIT_TIMEOUT_MS: number = 20_000;
const captureMock: jest.MockedFunction<typeof rushLib.captureProjectConfigurationFingerprintAsync> =
  jest.mocked(rushLib.captureProjectConfigurationFingerprintAsync);
const inputCaptureMock: jest.MockedFunction<typeof rushLib.captureWorkspaceInputFingerprintAsync> =
  jest.mocked(rushLib.captureWorkspaceInputFingerprintAsync);

async function waitForAsync(description: string, condition: () => boolean): Promise<void> {
  const deadline: number = Date.now() + WAIT_TIMEOUT_MS;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting until ${description}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

it('serves concurrent warm builds from one project configuration capture that started after they arrived', async () => {
  const fixture: DaemonGraphTestFixture = await DaemonGraphTestFixture.createAsync((created) =>
    setDaemonPolicy(created, {})
  );
  let release: () => void = () => {};
  try {
    await fixture.buildSuccessfullyAsync();
    await fixture.buildSuccessfullyAsync();
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(rushLib.WorkspaceInputChangeTier.Reuse);
    const generation: number = fixture.host.workspaceGeneration;

    const requests: jest.SpyInstance = jest.spyOn(FreshCaptureCoalescer.prototype, 'captureAsync');
    // The project configuration coalescer uses one key per workspace configuration.
    const projectCaptureRequests = (): number =>
      requests.mock.calls.filter(([, key]: unknown[]) => key === '').length;
    captureMock.mockClear();
    const gate: Promise<void> = new Promise<void>((resolve) => (release = resolve));
    const actual: typeof rushLib.captureProjectConfigurationFingerprintAsync = jest.requireActual<
      typeof rushLib
    >('@microsoft/rush-lib').captureProjectConfigurationFingerprintAsync;
    captureMock.mockImplementationOnce(async (...args) => {
      await gate;
      return await actual(...args);
    });

    const first: ReturnType<DaemonGraphTestFixture['buildAsync']> = fixture.buildAsync();
    await waitForAsync('the first build is capturing', () => captureMock.mock.calls.length === 1);
    const joiners: ReturnType<DaemonGraphTestFixture['buildAsync']>[] = [
      fixture.buildAsync(),
      fixture.buildAsync(),
      fixture.buildAsync()
    ];
    await waitForAsync(
      'every build asked for a capture',
      () => Math.max(projectCaptureRequests(), captureMock.mock.calls.length) === 4
    );
    expect(captureMock).toHaveBeenCalledTimes(1);
    release();

    for (const exchange of await Promise.all([first, ...joiners])) {
      expect(exchange.terminal).toMatchObject({ payload: { exitCode: 0 } });
    }
    // The joiners arrived while the first capture was running, so they shared one that started after them.
    expect(captureMock).toHaveBeenCalledTimes(2);
    expect(fixture.host.workspaceGeneration).toBe(generation);
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(rushLib.WorkspaceInputChangeTier.Reuse);
    requests.mockRestore();
  } finally {
    release();
    await fixture[Symbol.asyncDispose]();
  }
});

it('shares input fingerprint captures only between requests whose fingerprint environments are equal', async () => {
  const fixture: DaemonGraphTestFixture = await DaemonGraphTestFixture.createAsync((created) =>
    setDaemonPolicy(created, {})
  );
  let release: () => void = () => {};
  const requests: jest.SpyInstance = jest.spyOn(FreshCaptureCoalescer.prototype, 'captureAsync');
  try {
    await fixture.buildSuccessfullyAsync();
    await fixture.buildSuccessfullyAsync();
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(rushLib.WorkspaceInputChangeTier.Reuse);
    const generation: number = fixture.host.workspaceGeneration;

    // A variable that is part of the workspace fingerprint environment, unlike TERM and COLUMNS.
    const variable: string = 'RUSHD_CAPTURE_SHARING_TEST';
    const capturedValues = (): (string | undefined)[] =>
      inputCaptureMock.mock.calls.map(([options]) => options.environment[variable]);
    // The project configuration coalescer uses the empty key; input captures use environment keys.
    const inputCaptureRequests = (): number =>
      requests.mock.calls.filter(([, key]: unknown[]) => key !== '').length;
    requests.mockClear();
    inputCaptureMock.mockClear();
    const gate: Promise<void> = new Promise<void>((resolve) => (release = resolve));
    const actual: typeof rushLib.captureWorkspaceInputFingerprintAsync = jest.requireActual<
      typeof rushLib
    >('@microsoft/rush-lib').captureWorkspaceInputFingerprintAsync;
    inputCaptureMock.mockImplementationOnce(async (...args) => {
      await gate;
      return await actual(...args);
    });

    const first: ReturnType<DaemonGraphTestFixture['buildAsync']> = fixture.buildAsync();
    await waitForAsync('the first build is capturing', () => inputCaptureMock.mock.calls.length === 1);
    const argv: string[] = ['build', '--to', 'b', '--parallelism', '3'];
    const volatile: ReturnType<DaemonGraphTestFixture['runAsync']> = fixture.runAsync(argv, {
      environment: { ...fixture.environment, TERM: 'dumb', COLUMNS: '91' }
    });
    const other: ReturnType<DaemonGraphTestFixture['runAsync']> = fixture.runAsync(argv, {
      environment: { ...fixture.environment, [variable]: 'other' }
    });
    await waitForAsync('every build asked for an input capture', () => inputCaptureRequests() === 3);
    // The request with another environment captured it at once. The request that differs only in volatile
    // variables waits for the next capture that it can share.
    expect(capturedValues()).toEqual([undefined, 'other']);
    release();

    const [firstResult, volatileResult, otherResult] = await Promise.all([first, volatile, other]);
    expect(firstResult.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
    expect(volatileResult.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
    // Only the request with another environment needs a new daemon process, which this host cannot launch.
    expect(otherResult.terminal).toMatchObject({
      kind: 'requestRejected',
      payload: { message: expect.stringContaining('A new daemon process is required (environment)') }
    });
    expect(fixture.host.workspaceGeneration).toBe(generation);
    expect(fixture.runs()).toEqual(['a', 'b']);
  } finally {
    requests.mockRestore();
    release();
    await fixture[Symbol.asyncDispose]();
  }
});
