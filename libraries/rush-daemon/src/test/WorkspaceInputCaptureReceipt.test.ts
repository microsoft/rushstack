// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@microsoft/rush-lib', () => {
  const actual: typeof import('@microsoft/rush-lib') = jest.requireActual('@microsoft/rush-lib');
  return {
    ...actual,
    captureWorkspaceInputFingerprintAsync: jest.fn(actual.captureWorkspaceInputFingerprintAsync),
    captureProjectConfigurationFingerprintAsync: jest.fn(actual.captureProjectConfigurationFingerprintAsync)
  };
});

import * as rushLib from '@microsoft/rush-lib';

import { FreshCaptureCoalescer } from '../FreshCaptureCoalescer';
import { DaemonGraphTestFixture, responseSnapshot } from './DaemonGraphTestFixture';
import { setDaemonPolicy } from './WarmGenerationTestUtilities';

jest.setTimeout(60_000);

type CaptureRequest = [scope: object, key: string, captureAsync: () => Promise<unknown>, notBeforeMs?: number];
type BuildExchange = ReturnType<DaemonGraphTestFixture['buildAsync']>;

interface IGate {
  readonly promise: Promise<void>;
  readonly release: () => void;
}

const WAIT_TIMEOUT_MS: number = 20_000;
const actualRushLib: typeof rushLib = jest.requireActual('@microsoft/rush-lib');
const workspaceCaptureMock: jest.MockedFunction<typeof rushLib.captureWorkspaceInputFingerprintAsync> =
  jest.mocked(rushLib.captureWorkspaceInputFingerprintAsync);
const projectCaptureMock: jest.MockedFunction<typeof rushLib.captureProjectConfigurationFingerprintAsync> =
  jest.mocked(rushLib.captureProjectConfigurationFingerprintAsync);
const originalCaptureAsync: FreshCaptureCoalescer<object, unknown>['captureAsync'] =
  FreshCaptureCoalescer.prototype.captureAsync;

function createGate(): IGate {
  let release: () => void = () => {};
  const promise: Promise<void> = new Promise<void>((resolve) => (release = resolve));
  return { promise, release: () => release() };
}

async function waitForAsync(description: string, condition: () => boolean): Promise<void> {
  const deadline: number = Date.now() + WAIT_TIMEOUT_MS;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting until ${description}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// The project configuration coalescer uses one key per workspace configuration.
function isProjectRequest(request: unknown[]): boolean {
  return request[1] === '';
}

function describeRequest(request: unknown[]): [string, string] {
  return [isProjectRequest(request) ? 'project' : 'workspace', typeof request[3]];
}

function countRequests(requests: jest.SpyInstance, kind: 'workspace' | 'project'): number {
  return requests.mock.calls.filter((request: unknown[]) => describeRequest(request)[0] === kind).length;
}

/**
 * Makes the first `count` workspace input requests wait until all of them have arrived, and then makes them in
 * one loop, as requests that were received together would if none of them was delayed on the way.
 */
function holdWorkspaceRequests(requests: jest.SpyInstance, count: number): void {
  const waiting: (() => void)[] = [];
  requests.mockImplementation(function (
    this: FreshCaptureCoalescer<object, unknown>,
    ...request: CaptureRequest
  ): Promise<unknown> {
    if (waiting.length === count || isProjectRequest(request)) return originalCaptureAsync.apply(this, request);
    return new Promise((resolve) => {
      waiting.push(() => resolve(originalCaptureAsync.apply(this, request)));
      if (waiting.length === count) for (const start of waiting) start();
    });
  });
}

function gateNextCapture<TArgs extends unknown[], TResult>(
  mock: jest.MockedFunction<(...args: TArgs) => Promise<TResult>>,
  actual: (...args: TArgs) => Promise<TResult>
): IGate {
  const gate: IGate = createGate();
  mock.mockImplementationOnce(async (...args: TArgs) => {
    await gate.promise;
    return await actual(...args);
  });
  return gate;
}

async function expectSuccessfulBuildsAsync(builds: BuildExchange[]): Promise<void> {
  for (const exchange of await Promise.all(builds)) {
    expect(exchange.terminal).toMatchObject({ payload: { exitCode: 0 } });
  }
}

async function createWarmFixtureAsync(): Promise<DaemonGraphTestFixture> {
  const fixture: DaemonGraphTestFixture = await DaemonGraphTestFixture.createAsync((created) =>
    setDaemonPolicy(created, {})
  );
  try {
    await fixture.buildSuccessfullyAsync();
    await fixture.buildSuccessfullyAsync();
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(rushLib.WorkspaceInputChangeTier.Reuse);
    return fixture;
  } catch (error) {
    await fixture[Symbol.asyncDispose]();
    throw error;
  }
}

describe('workspace input captures shared from the time a request was received', () => {
  const gates: IGate[] = [];
  let requests: jest.SpyInstance | undefined;
  let fixture: DaemonGraphTestFixture | undefined;

  function spyOnRequests(): jest.SpyInstance {
    requests = jest.spyOn(FreshCaptureCoalescer.prototype, 'captureAsync');
    return requests;
  }

  function gate(next: IGate): IGate {
    gates.push(next);
    return next;
  }

  afterEach(async () => {
    for (const next of gates.splice(0)) next.release();
    requests?.mockRestore();
    requests = undefined;
    const disposing: DaemonGraphTestFixture | undefined = fixture;
    fixture = undefined;
    try {
      await disposing?.[Symbol.asyncDispose]();
    } finally {
      workspaceCaptureMock.mockReset();
      workspaceCaptureMock.mockImplementation(actualRushLib.captureWorkspaceInputFingerprintAsync);
      projectCaptureMock.mockReset();
      projectCaptureMock.mockImplementation(actualRushLib.captureProjectConfigurationFingerprintAsync);
    }
  });

  it('shares the first captures of warm builds that were all received before those captures started', async () => {
    fixture = await createWarmFixtureAsync();
    const warm: DaemonGraphTestFixture = fixture;
    const generation: number = warm.host.workspaceGeneration;
    const spy: jest.SpyInstance = spyOnRequests();
    holdWorkspaceRequests(spy, 3);
    workspaceCaptureMock.mockClear();
    projectCaptureMock.mockClear();
    const projectGate: IGate = gate(
      gateNextCapture(projectCaptureMock, actualRushLib.captureProjectConfigurationFingerprintAsync)
    );

    const builds: BuildExchange[] = [warm.buildAsync(), warm.buildAsync(), warm.buildAsync()];
    await waitForAsync(
      'every build asked for a project configuration capture',
      () => countRequests(spy, 'project') === 3
    );
    // A strict coalescer would start a second capture for the builds that reached it after the first one started.
    expect(workspaceCaptureMock).toHaveBeenCalledTimes(1);
    expect(projectCaptureMock).toHaveBeenCalledTimes(1);
    projectGate.release();

    await expectSuccessfulBuildsAsync(builds);
    expect(projectCaptureMock).toHaveBeenCalledTimes(1);
    expect(warm.host.workspaceGeneration).toBe(generation);
    expect(warm.host.workspaceStatus.lastReloadTier).toBe(rushLib.WorkspaceInputChangeTier.Reuse);
  });

  it('never shares a capture that started before a build was received', async () => {
    fixture = await createWarmFixtureAsync();
    const warm: DaemonGraphTestFixture = fixture;
    const spy: jest.SpyInstance = spyOnRequests();
    workspaceCaptureMock.mockClear();
    projectCaptureMock.mockClear();
    const workspaceGate: IGate = gate(
      gateNextCapture(workspaceCaptureMock, actualRushLib.captureWorkspaceInputFingerprintAsync)
    );
    const projectGate: IGate = gate(
      gateNextCapture(projectCaptureMock, actualRushLib.captureProjectConfigurationFingerprintAsync)
    );

    const first: BuildExchange = warm.buildAsync();
    await waitForAsync('the first build is capturing', () => workspaceCaptureMock.mock.calls.length === 1);
    const late: BuildExchange = warm.buildAsync();
    await waitForAsync('the late build asked for a capture', () => countRequests(spy, 'workspace') === 2);
    workspaceGate.release();
    await waitForAsync(
      'both builds asked for a project configuration capture',
      () => countRequests(spy, 'project') === 2
    );
    // The late build was received after the first workspace capture started, so it waited for its own.
    expect(workspaceCaptureMock).toHaveBeenCalledTimes(2);
    projectGate.release();

    await expectSuccessfulBuildsAsync([first, late]);
    // It was received before the first project configuration capture started, so it shared that one.
    expect(projectCaptureMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the receipt time for builds that wait behind a transition', async () => {
    fixture = await DaemonGraphTestFixture.createAsync((created) => setDaemonPolicy(created, {}));
    const cold: DaemonGraphTestFixture = fixture;
    const spy: jest.SpyInstance = spyOnRequests();
    workspaceCaptureMock.mockClear();
    const workspaceGate: IGate = gate(
      gateNextCapture(workspaceCaptureMock, actualRushLib.captureWorkspaceInputFingerprintAsync)
    );

    const first: BuildExchange = cold.buildAsync();
    await waitForAsync('the first build is capturing', () => workspaceCaptureMock.mock.calls.length === 1);
    const waiters: BuildExchange[] = [cold.buildAsync(), cold.buildAsync()];
    await waitForAsync('every build asked for a capture', () => countRequests(spy, 'workspace') === 3);
    workspaceGate.release();
    await expectSuccessfulBuildsAsync([first, ...waiters]);
    expect(cold.host.workspaceStatus.lastReloadTier).toBe(rushLib.WorkspaceInputChangeTier.Reuse);

    const byReceipt: Map<number, string[]> = new Map();
    for (const request of spy.mock.calls as unknown[][]) {
      const notBeforeMs: unknown = request[3];
      if (typeof notBeforeMs !== 'number') continue;
      byReceipt.set(notBeforeMs, [...(byReceipt.get(notBeforeMs) ?? []), describeRequest(request)[0]]);
    }
    // One build loads the graph. The others were admitted before it began, wait behind its transition, and then
    // prepare again with the time at which they were received.
    expect([...byReceipt.values()].sort((a: string[], b: string[]) => a.length - b.length)).toEqual([
      ['workspace', 'project'],
      ['workspace', 'project', 'workspace', 'project'],
      ['workspace', 'project', 'workspace', 'project']
    ]);
  });

  it('passes the receipt time only to the captures that decide whether a request can reuse the workspace', async () => {
    fixture = await createWarmFixtureAsync();
    const warm: DaemonGraphTestFixture = fixture;
    const spy: jest.SpyInstance = spyOnRequests();

    await warm.buildSuccessfullyAsync();
    expect(warm.host.workspaceStatus.lastReloadTier).toBe(rushLib.WorkspaceInputChangeTier.Reuse);
    // The last capture validates the graph inputs before execution and must start after it was requested.
    expect(spy.mock.calls.map(describeRequest)).toEqual([
      ['workspace', 'number'],
      ['project', 'number'],
      ['workspace', 'undefined']
    ]);

    spy.mockClear();
    setDaemonPolicy(warm, { warmSetMaxProjects: 19 });
    await warm.buildSuccessfullyAsync();
    expect(warm.host.workspaceStatus.lastReloadTier).toBe(rushLib.WorkspaceInputChangeTier.Reload);
    // A transition detects changes made while it runs, so every capture after the first one is strict.
    const reload: [string, string][] = spy.mock.calls.map(describeRequest);
    expect(reload[0]).toEqual(['workspace', 'number']);
    expect(reload.slice(1).map(([, notBeforeMs]) => notBeforeMs)).toEqual(
      reload.slice(1).map(() => 'undefined')
    );
    expect(reload).toContainEqual(['project', 'undefined']);

    spy.mockClear();
    responseSnapshot(await warm.graphAsync('invalidate', '--project', 'a'));
    // Graph control checks the inputs of the generation it changes, so its captures are strict as well.
    expect(spy.mock.calls.map(describeRequest)).toEqual([
      ['workspace', 'undefined'],
      ['project', 'undefined']
    ]);
  });

  it('checks the project configurations again with a strict capture when a transition can reuse the workspace', async () => {
    fixture = await createWarmFixtureAsync();
    const warm: DaemonGraphTestFixture = fixture;
    const generation: number = warm.host.workspaceGeneration;
    const spy: jest.SpyInstance = spyOnRequests();
    projectCaptureMock.mockClear();
    // The project configurations changed before the build was received and changed back before its transition.
    projectCaptureMock.mockImplementationOnce(async () => 'a project configuration that was changed back');

    await warm.buildSuccessfullyAsync();
    expect(warm.host.workspaceGeneration).toBe(generation);
    expect(warm.host.workspaceStatus.lastReloadTier).toBe(rushLib.WorkspaceInputChangeTier.Reuse);
    expect(projectCaptureMock).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls.map(describeRequest)).toEqual([
      ['workspace', 'number'],
      ['project', 'number'],
      ['workspace', 'undefined'],
      ['project', 'undefined'],
      ['workspace', 'undefined']
    ]);
  });
});
