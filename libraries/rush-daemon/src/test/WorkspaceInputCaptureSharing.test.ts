// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@microsoft/rush-lib', () => {
  const actual: typeof import('@microsoft/rush-lib') = jest.requireActual('@microsoft/rush-lib');
  return {
    ...actual,
    captureProjectConfigurationFingerprintAsync: jest.fn(actual.captureProjectConfigurationFingerprintAsync)
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
