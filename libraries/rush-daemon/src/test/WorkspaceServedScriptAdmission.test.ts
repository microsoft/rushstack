// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@microsoft/rush-lib', () => {
  const actual: typeof import('@microsoft/rush-lib') = jest.requireActual('@microsoft/rush-lib');
  return {
    ...actual,
    captureWorkspaceInputFingerprintAsync: jest.fn(actual.captureWorkspaceInputFingerprintAsync)
  };
});

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  captureWorkspaceInputFingerprintAsync,
  type IWorkspaceInputFingerprint,
  WorkspaceInputChangeTier,
  WorkspaceRuntimeFingerprintCache
} from '@microsoft/rush-lib';
import {
  DaemonFrameType,
  decodeDaemonControlMessage,
  type DaemonControlMessage,
  type DaemonRestartReason,
  type IDaemonCommandResult,
  type IDaemonFrame,
  type IDaemonRequestEnvelope,
  type IDaemonRequestQueuePositionMessage
} from '@rushstack/rush-daemon-protocol';

import { getInstalledWorkspaceSuccessorLaunchAsync } from '../WorkspaceProcessRestart';
import { RequestAdmissionController } from '../WorkspaceRequestAdmission';
import { DaemonGraphTestFixture, responseSnapshot, withScriptDeadline } from './DaemonGraphTestFixture';
import type { DaemonRequestWireClient, ITerminalExchange } from './DaemonRequestWireTestUtilities';
import { pongAsync, setDaemonPolicy } from './WarmGenerationTestUtilities';
import { stopSuccessorAsync } from './WorkspaceLifecycleTestProcess';

jest.setTimeout(60_000);

const BUILD_A: string[] = ['build', '--to', 'a', '--parallelism', '3'];
const RELEASE_FILE: string = 'release-serve';
const LATE_RELEASE_FILE: string = 'release-serve2';
const inputCaptureMock: jest.MockedFunction<typeof captureWorkspaceInputFingerprintAsync> = jest.mocked(
  captureWorkspaceInputFingerprintAsync
);

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

/**
 * Project a's `serve` and `serve2` scripts run, like dev servers, until the test creates their release files,
 * `release-serve` and `release-serve2`.
 */
function createServingFixtureAsync(
  configure?: (fixture: DaemonGraphTestFixture) => void
): Promise<DaemonGraphTestFixture> {
  return DaemonGraphTestFixture.createAsync((created) => {
    created.servesRushx = true;
    created.write('.gitignore', 'common/temp/\n**/.rush/\n**/rush-logs/\nruns.txt\nrelease-*\n');
    created.write(
      'a/package.json',
      JSON.stringify({
        name: 'a',
        version: '1.0.0',
        dependencies: {},
        scripts: {
          '_phase:compile': 'node build.cjs',
          serve: 'node serve.cjs',
          serve2: 'node serve.cjs serve2'
        }
      })
    );
    created.write(
      'a/serve.cjs',
      withScriptDeadline(
        "const fs=require('node:fs');const n=process.argv[2]||'serve';fs.appendFileSync('../runs.txt',n+'-start\\n');" +
          "const t=setInterval(()=>{if(fs.existsSync('../release-'+n)){clearInterval(t);" +
          "fs.appendFileSync('../runs.txt',n+'-end\\n');}},20);"
      )
    );
    configure?.(created);
  });
}

interface IServedScript {
  readonly exchange: Promise<ITerminalExchange>;
  readonly settled: () => boolean;
}

async function serveAsync(
  fixture: DaemonGraphTestFixture,
  script: 'serve' | 'serve2' = 'serve'
): Promise<IServedScript> {
  let settled: boolean = false;
  const exchange: Promise<ITerminalExchange> = fixture
    .runAsync([script], {
      commandOrigin: 'custom',
      invocationKind: 'rushx',
      cwd: path.join(fixture.folder, 'a')
    })
    .finally(() => {
      settled = true;
    });
  await waitForAsync(
    () => fixture.runs().includes(`${script}-start`) || settled,
    'the served script to start'
  );
  expect(settled).toBe(false);
  return { exchange, settled: () => settled };
}

interface IStreamedRequest {
  readonly exchange: Promise<ITerminalExchange>;
  readonly requestId: string;
  /** The queue positions that the daemon has reported so far. */
  readonly positions: ReadonlyArray<number>;
  /** The payloads of those queue position messages. */
  readonly positionPayloads: ReadonlyArray<IDaemonRequestQueuePositionMessage['payload']>;
  readonly settled: () => boolean;
}

/** Starts a request, recording its queue positions as they arrive. */
async function startRequestAsync(
  fixture: DaemonGraphTestFixture,
  argv: string[],
  overrides: Partial<IDaemonRequestEnvelope>
): Promise<IStreamedRequest> {
  const client: DaemonRequestWireClient = await fixture.connectAsync();
  const payload: IDaemonRequestEnvelope = fixture.envelope(argv, overrides);
  await client.sendControlAsync({ kind: 'requestStart', payload });
  const positions: number[] = [];
  const positionPayloads: IDaemonRequestQueuePositionMessage['payload'][] = [];
  let settled: boolean = false;
  const readAsync = async (): Promise<ITerminalExchange> => {
    const frames: IDaemonFrame[] = [];
    try {
      for (;;) {
        const frame: IDaemonFrame = await client.readFrameAsync();
        frames.push(frame);
        if (frame.kind !== DaemonFrameType.controlJson) continue;
        const message: DaemonControlMessage = decodeDaemonControlMessage(frame.payload);
        if (message.kind === 'queuePosition') {
          positions.push(message.payload.position);
          positionPayloads.push(message.payload);
        }
        if (message.kind === 'requestResult' && message.payload.requestId === payload.requestId) {
          return { frames, terminal: message };
        }
      }
    } finally {
      settled = true;
      await client.closeAsync();
    }
  };
  const exchange: Promise<ITerminalExchange> = readAsync();
  // A failed expectation leaves the exchange unread until the fixture closes the connection.
  exchange.catch(() => undefined);
  return { exchange, requestId: payload.requestId, positions, positionPayloads, settled: () => settled };
}

/**
 * Changes an input that only a new daemon process picks up, as an install does, and returns a function that
 * restores its content.
 */
function changeInstallation(fixture: DaemonGraphTestFixture): () => void {
  const filePath: string = path.join(fixture.folder, 'common/config/rush/npm-shrinkwrap.json');
  const original: string = fs.readFileSync(filePath, 'utf8');
  fs.writeFileSync(filePath, `${original}\n`);
  return () => fs.writeFileSync(filePath, original);
}

async function closeRestartingFixtureAsync(fixture: DaemonGraphTestFixture): Promise<void> {
  try {
    await fixture.host.closeAsync();
    await fixture.host.restartCompleted;
  } finally {
    await stopSuccessorAsync(fixture.host.paths);
    await fixture[Symbol.asyncDispose]();
  }
}

function changeProjectConfiguration(fixture: DaemonGraphTestFixture): void {
  const packageJsonPath: string = path.join(fixture.folder, 'c/package.json');
  const packageJson: Record<string, unknown> = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  fs.writeFileSync(packageJsonPath, JSON.stringify({ ...packageJson, description: 'changed' }));
}

describe('workspace admission while a served rushx script runs', () => {
  it('admits a reload-needing build at once and keeps the script running', async () => {
    const fixture: DaemonGraphTestFixture = await createServingFixtureAsync();
    try {
      expectSuccess(await fixture.runAsync(BUILD_A));
      const generation: number = fixture.host.workspaceGeneration;
      const script: IServedScript = await serveAsync(fixture);

      changeProjectConfiguration(fixture);
      // The reload used to wait for #gate until the script exited.
      expectSuccess(await fixture.runAsync(BUILD_A, { admission: { waitTimeoutMs: 3000 } }));
      expect(fixture.host.workspaceGeneration).toBeGreaterThan(generation);
      expect(fixture.host.workspaceStatus.lastReloadTier).toBe(WorkspaceInputChangeTier.Reload);
      expect(script.settled()).toBe(false);

      fixture.write(RELEASE_FILE, '');
      expectSuccess(await script.exchange);
      expect(fixture.runs().slice(-1)).toEqual(['serve-end']);
    } finally {
      // A failed expectation must not leave the script running, which would keep the fixture from shutting down.
      fixture.write(RELEASE_FILE, '');
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('keeps a native install waiting for the script, which would end with this process', async () => {
    const fixture: DaemonGraphTestFixture = await createServingFixtureAsync((created) => {
      // The install is never admitted, so no successor is launched.
      created.getSuccessorLaunchAsync = () => Promise.reject(new Error('No successor was expected.'));
    });
    try {
      expectSuccess(await fixture.runAsync(BUILD_A));
      const script: IServedScript = await serveAsync(fixture);

      const install: IStreamedRequest = await startRequestAsync(fixture, ['install'], {
        admission: { waitTimeoutMs: 500 }
      });
      expect((await install.exchange).terminal).toMatchObject({
        kind: 'requestResult',
        payload: {
          exitCode: 1,
          admissionErrorCode: 'wait-timeout',
          errorMessage: expect.stringContaining(
            'within its 500ms wait timeout while waiting for a rushx script that this daemon runs to exit.'
          )
        }
      });
      // The install runs once the script exits, and then restarts the daemon, so its client names no reason.
      expect(install.positionPayloads).toEqual([
        { position: 1, requestId: install.requestId, scriptCount: 1 }
      ]);
      expect(script.settled()).toBe(false);

      fixture.write(RELEASE_FILE, '');
      expectSuccess(await script.exchange);
      expect(fixture.runs().slice(-1)).toEqual(['serve-end']);
      // The refused install left the workspace serving builds.
      expectSuccess(await fixture.runAsync(BUILD_A));
    } finally {
      fixture.write(RELEASE_FILE, '');
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('restarts for a changed environment only after the script exits', async () => {
    const fixture: DaemonGraphTestFixture = await createServingFixtureAsync((created) => {
      setDaemonPolicy(created, {});
      created.getSuccessorLaunchAsync = getInstalledWorkspaceSuccessorLaunchAsync;
    });
    try {
      const before = await pongAsync(fixture);
      expectSuccess(await fixture.runAsync(BUILD_A));
      const script: IServedScript = await serveAsync(fixture);

      let restartSettled: boolean = false;
      const restart: Promise<ITerminalExchange> = fixture
        .runAsync(BUILD_A, { environment: { ...fixture.environment, RUSHD_RELOAD_TIER_TEST: 'changed' } })
        .finally(() => {
          restartSettled = true;
        });
      await delayAsync(1000);
      // The script keeps its restart ticket after it releases #gate, so the restart still drains it.
      expect(restartSettled).toBe(false);
      expect(script.settled()).toBe(false);
      expect(fixture.host.workspaceStatus.lastReloadTier).not.toBe(WorkspaceInputChangeTier.Restart);

      fixture.write(RELEASE_FILE, '');
      expectSuccess(await script.exchange);
      expect(fixture.runs().slice(-1)).toEqual(['serve-end']);
      expect((await restart).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 1, retryAfterRestart: true }
      });
      const restarted = await fixture.host.restartCompleted;
      expect(restarted?.pid).not.toBe(before.pid);
    } finally {
      fixture.write(RELEASE_FILE, '');
      try {
        await fixture.host.closeAsync();
        await fixture.host.restartCompleted;
      } finally {
        await stopSuccessorAsync(fixture.host.paths);
        await fixture[Symbol.asyncDispose]();
      }
    }
  });

  it('has a script that arrives while a restart is pending run on the successor, without delaying the restart', async () => {
    const fixture: DaemonGraphTestFixture = await createServingFixtureAsync((created) => {
      setDaemonPolicy(created, {});
      created.getSuccessorLaunchAsync = getInstalledWorkspaceSuccessorLaunchAsync;
    });
    try {
      const before = await pongAsync(fixture);
      expectSuccess(await fixture.runAsync(BUILD_A));
      const script: IServedScript = await serveAsync(fixture);

      const restart: IStreamedRequest = await startRequestAsync(fixture, BUILD_A, {
        environment: { ...fixture.environment, RUSHD_RELOAD_TIER_TEST: 'changed' }
      });
      await waitForAsync(
        () => restart.positions.length > 0 || restart.settled(),
        'the restart to wait for the served script'
      );
      const late: IStreamedRequest = await startRequestAsync(fixture, ['serve2'], {
        commandOrigin: 'custom',
        invocationKind: 'rushx',
        cwd: path.join(fixture.folder, 'a')
      });
      await waitForAsync(
        () => late.positions.length > 0 || late.settled() || fixture.runs().includes('serve2-start'),
        'the later script to wait for the restart'
      );
      // The later script used to start and keep the restart waiting until it exited.
      expect(fixture.runs()).not.toContain('serve2-start');
      // It waits for the served script and the restart.
      expect(late.positions).toEqual([2]);
      const restartReason: DaemonRestartReason = {
        kind: 'environmentChanged',
        variableNames: ['RUSHD_RELOAD_TIER_TEST']
      };
      await waitForAsync(
        () => restart.positionPayloads.length >= 3 || restart.settled(),
        'the restart to stop counting the later script'
      );
      expect(restart.positionPayloads).toEqual([
        { position: 1, requestId: restart.requestId, restartReason, scriptCount: 1 },
        // The later script counts until it finds that a restart is pending.
        { position: 2, requestId: restart.requestId, restartReason, scriptCount: 2 },
        { position: 1, requestId: restart.requestId, restartReason, scriptCount: 1 }
      ]);
      expect(late.positionPayloads).toEqual([
        {
          position: 2,
          requestId: late.requestId,
          restartReason,
          scriptCount: 1,
          restartsForAnotherRequest: true
        }
      ]);

      fixture.write(RELEASE_FILE, '');
      expectSuccess(await script.exchange);
      // The restart does not wait for the later script, which is told to run on the successor.
      for (const exchange of await Promise.all([restart.exchange, late.exchange])) {
        expect(exchange.terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 1, retryAfterRestart: true }
        });
      }
      expect(late.positions).toEqual([2, 1]);
      expect(late.positionPayloads[1]).toEqual({
        position: 1,
        requestId: late.requestId,
        restartReason,
        restartsForAnotherRequest: true
      });
      expect(fixture.runs()).not.toContain('serve2-start');
      const restarted = await fixture.host.restartCompleted;
      expect(restarted?.pid).not.toBe(before.pid);
    } finally {
      fixture.write(RELEASE_FILE, '');
      fixture.write(LATE_RELEASE_FILE, '');
      try {
        await fixture.host.closeAsync();
        await fixture.host.restartCompleted;
      } finally {
        await stopSuccessorAsync(fixture.host.paths);
        await fixture[Symbol.asyncDispose]();
      }
    }
  });
});

describe('a restart drain whose change is reverted', () => {
  const SERVE2: Partial<IDaemonRequestEnvelope> = { commandOrigin: 'custom', invocationKind: 'rushx' };

  it('serves the request on this process, while the script that holds the drain still runs', async () => {
    const fixture: DaemonGraphTestFixture = await createServingFixtureAsync((created) => {
      setDaemonPolicy(created, {});
      created.getSuccessorLaunchAsync = getInstalledWorkspaceSuccessorLaunchAsync;
    });
    try {
      const before = await pongAsync(fixture);
      expectSuccess(await fixture.runAsync(BUILD_A));
      // A transition would cancel the watcher, and a request that arrives when nothing needs one does not transition.
      const watch: IStreamedRequest = await startRequestAsync(fixture, ['daemon', 'graph', 'watch'], {});
      const script: IServedScript = await serveAsync(fixture);

      const revert: () => void = changeInstallation(fixture);
      const build: IStreamedRequest = await startRequestAsync(fixture, BUILD_A, {
        admission: { waitTimeoutMs: 20_000 }
      });
      await waitForAsync(
        () => build.positions.length > 0 || build.settled(),
        'the build to wait for the drain'
      );
      const late: IStreamedRequest = await startRequestAsync(fixture, ['serve2'], {
        ...SERVE2,
        cwd: path.join(fixture.folder, 'a')
      });
      await waitForAsync(
        () => late.positions.length > 0 || late.settled(),
        'the script to wait for the restart'
      );
      // Several rechecks find that the change is still there.
      await delayAsync(2500);
      expect(build.settled()).toBe(false);
      expect(fixture.runs()).not.toContain('serve2-start');

      const revertedAt: number = Date.now();
      revert();
      // The build used to wait for the script to exit, which a dev server never does.
      expectSuccess(await build.exchange);
      expect(Date.now() - revertedAt).toBeLessThan(5000);
      expect(script.settled()).toBe(false);
      // The later script no longer waits for a restart either.
      await waitForAsync(() => fixture.runs().includes('serve2-start'), 'the later script to start');
      expect((await pongAsync(fixture)).pid).toBe(before.pid);
      expect(fixture.host.workspaceStatus.lastReloadTier).not.toBe(WorkspaceInputChangeTier.Restart);
      expect(watch.settled()).toBe(false);

      fixture.write(RELEASE_FILE, '');
      fixture.write(LATE_RELEASE_FILE, '');
      expectSuccess(await script.exchange);
      expectSuccess(await late.exchange);
    } finally {
      fixture.write(RELEASE_FILE, '');
      fixture.write(LATE_RELEASE_FILE, '');
      await closeRestartingFixtureAsync(fixture);
    }
  });

  it('serves a graph control request on this process', async () => {
    const fixture: DaemonGraphTestFixture = await createServingFixtureAsync((created) => {
      setDaemonPolicy(created, {});
      created.getSuccessorLaunchAsync = getInstalledWorkspaceSuccessorLaunchAsync;
    });
    try {
      const before = await pongAsync(fixture);
      expectSuccess(await fixture.runAsync(BUILD_A));
      const script: IServedScript = await serveAsync(fixture);

      const revert: () => void = changeInstallation(fixture);
      const pause: IStreamedRequest = await startRequestAsync(fixture, ['daemon', 'graph', 'pause'], {
        admission: { waitTimeoutMs: 20_000 }
      });
      await waitForAsync(
        () => pause.positions.length > 0 || pause.settled(),
        'the request to wait for the drain'
      );
      await delayAsync(1500);
      expect(pause.settled()).toBe(false);
      // Like a build, the request is told why it waits (task 166).
      expect(pause.positionPayloads[0]).toEqual({
        position: 1,
        requestId: pause.requestId,
        restartReason: {
          kind: 'workspaceInputsChanged',
          installationFiles: ['common/config/rush/npm-shrinkwrap.json']
        },
        scriptCount: 1
      });

      const revertedAt: number = Date.now();
      revert();
      expect(responseSnapshot(await pause.exchange)).toMatchObject({ pauseNextIteration: true });
      expect(Date.now() - revertedAt).toBeLessThan(5000);
      expect(script.settled()).toBe(false);
      expect((await pongAsync(fixture)).pid).toBe(before.pid);

      fixture.write(RELEASE_FILE, '');
      expectSuccess(await script.exchange);
    } finally {
      fixture.write(RELEASE_FILE, '');
      await closeRestartingFixtureAsync(fixture);
    }
  });

  it('still restarts after the drain when the change stays', async () => {
    const fixture: DaemonGraphTestFixture = await createServingFixtureAsync((created) => {
      setDaemonPolicy(created, {});
      created.getSuccessorLaunchAsync = getInstalledWorkspaceSuccessorLaunchAsync;
    });
    try {
      const before = await pongAsync(fixture);
      expectSuccess(await fixture.runAsync(BUILD_A));
      const script: IServedScript = await serveAsync(fixture);

      changeInstallation(fixture);
      const build: IStreamedRequest = await startRequestAsync(fixture, BUILD_A, {
        admission: { waitTimeoutMs: 20_000 }
      });
      await waitForAsync(
        () => build.positions.length > 0 || build.settled(),
        'the build to wait for the drain'
      );
      await delayAsync(2500);
      expect(build.settled()).toBe(false);

      fixture.write(RELEASE_FILE, '');
      expectSuccess(await script.exchange);
      expect((await build.exchange).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 1, retryAfterRestart: true }
      });
      const restarted = await fixture.host.restartCompleted;
      expect(restarted?.pid).not.toBe(before.pid);
    } finally {
      fixture.write(RELEASE_FILE, '');
      await closeRestartingFixtureAsync(fixture);
    }
  });

  it('does not keep scripts waiting when the request finds after its drain that it no longer needs the restart', async () => {
    const fixture: DaemonGraphTestFixture = await createServingFixtureAsync((created) => {
      setDaemonPolicy(created, {});
      created.getSuccessorLaunchAsync = getInstalledWorkspaceSuccessorLaunchAsync;
      // Project c builds until the test creates release-build.
      created.write(
        'c/build.cjs',
        withScriptDeadline(
          "const fs=require('node:fs');fs.appendFileSync('../runs.txt','c-start\\n');" +
            "const t=setInterval(()=>{if(fs.existsSync('../release-build')){clearInterval(t);" +
            "fs.appendFileSync('../runs.txt','c-end\\n');}},20);"
        )
      );
    });
    try {
      const before = await pongAsync(fixture);
      expectSuccess(await fixture.runAsync(BUILD_A));
      const script: IServedScript = await serveAsync(fixture);

      const revert: () => void = changeInstallation(fixture);
      const build: IStreamedRequest = await startRequestAsync(fixture, ['build', '--to', 'c'], {
        admission: { waitTimeoutMs: 20_000 }
      });
      await waitForAsync(
        () => build.positions.length > 0 || build.settled(),
        'the build to wait for the drain'
      );
      const late: IStreamedRequest = await startRequestAsync(fixture, ['serve2'], {
        ...SERVE2,
        cwd: path.join(fixture.folder, 'a')
      });
      await waitForAsync(
        () => late.positions.length > 0 || late.settled(),
        'the script to wait for the restart'
      );

      // The drain ends as the script exits, so the build most likely finds the revert only after the drain.
      revert();
      fixture.write(RELEASE_FILE, '');
      expectSuccess(await script.exchange);
      await waitForAsync(() => fixture.runs().includes('c-start'), 'the build to start');
      // The later script used to wait for the build to finish, since its restart stayed pending.
      await waitForAsync(() => fixture.runs().includes('serve2-start'), 'the later script to start');
      expect(fixture.runs()).not.toContain('c-end');

      fixture.write('release-build', '');
      fixture.write(LATE_RELEASE_FILE, '');
      expectSuccess(await build.exchange);
      expectSuccess(await late.exchange);
      expect((await pongAsync(fixture)).pid).toBe(before.pid);
    } finally {
      fixture.write(RELEASE_FILE, '');
      fixture.write(LATE_RELEASE_FILE, '');
      fixture.write('release-build', '');
      await closeRestartingFixtureAsync(fixture);
    }
  });

  it('shares one capture a second between the requests that wait for the drain', async () => {
    const fixture: DaemonGraphTestFixture = await createServingFixtureAsync((created) => {
      setDaemonPolicy(created, {});
      created.getSuccessorLaunchAsync = getInstalledWorkspaceSuccessorLaunchAsync;
    });
    try {
      const before = await pongAsync(fixture);
      expectSuccess(await fixture.runAsync(BUILD_A));
      const script: IServedScript = await serveAsync(fixture);

      const revert: () => void = changeInstallation(fixture);
      const builds: IStreamedRequest[] = [];
      // The requests arrive over about a second, so each one's checks would start at another time.
      for (let i: number = 0; i < 16; i++) {
        builds.push(await startRequestAsync(fixture, BUILD_A, { admission: { waitTimeoutMs: 20_000 } }));
        await delayAsync(60);
      }
      await waitForAsync(
        () => builds.every((build) => build.positions.length > 0 || build.settled()),
        'every build to wait for the drain'
      );
      inputCaptureMock.mockClear();
      await delayAsync(3000);
      // Each waiting request used to capture its inputs once a second, 16 captures a second in all.
      const captures: number = inputCaptureMock.mock.calls.length;
      expect(captures).toBeGreaterThanOrEqual(2);
      expect(captures).toBeLessThanOrEqual(5);
      expect(builds.some((build) => build.settled())).toBe(false);

      const revertedAt: number = Date.now();
      revert();
      for (const build of builds) {
        expectSuccess(await build.exchange);
      }
      expect(Date.now() - revertedAt).toBeLessThan(10_000);
      expect(script.settled()).toBe(false);
      expect((await pongAsync(fixture)).pid).toBe(before.pid);

      fixture.write(RELEASE_FILE, '');
      expectSuccess(await script.exchange);
    } finally {
      fixture.write(RELEASE_FILE, '');
      await closeRestartingFixtureAsync(fixture);
    }
  });

  it('does not check again for a request that needs the restart for its environment, so the others see their revert', async () => {
    const fixture: DaemonGraphTestFixture = await createServingFixtureAsync((created) => {
      setDaemonPolicy(created, {});
      created.getSuccessorLaunchAsync = getInstalledWorkspaceSuccessorLaunchAsync;
    });
    const capturesOfChangedEnvironment: () => number = () =>
      inputCaptureMock.mock.calls.filter(
        ([options]) => options.environment.RUSHD_RELOAD_TIER_TEST === 'changed'
      ).length;
    try {
      const before = await pongAsync(fixture);
      expectSuccess(await fixture.runAsync(BUILD_A));
      const script: IServedScript = await serveAsync(fixture);

      const revert: () => void = changeInstallation(fixture);
      const changed: IStreamedRequest = await startRequestAsync(fixture, BUILD_A, {
        environment: { ...fixture.environment, RUSHD_RELOAD_TIER_TEST: 'changed' },
        admission: { waitTimeoutMs: 20_000 }
      });
      await waitForAsync(() => changed.positions.length > 0 || changed.settled(), 'the first build to wait');
      // Each second, its check would start about 0.3 s before the second build's, which would then share it.
      await delayAsync(300);
      const build: IStreamedRequest = await startRequestAsync(fixture, BUILD_A, {
        admission: { waitTimeoutMs: 20_000 }
      });
      await waitForAsync(() => build.positions.length > 0 || build.settled(), 'the second build to wait');
      inputCaptureMock.mockClear();
      await delayAsync(2500);
      expect(capturesOfChangedEnvironment()).toBe(0);
      expect(changed.settled()).toBe(false);
      expect(build.settled()).toBe(false);

      const revertedAt: number = Date.now();
      revert();
      expectSuccess(await build.exchange);
      expect(Date.now() - revertedAt).toBeLessThan(5000);
      // A request's environment does not change, so the first build still waits for the restart.
      expect(changed.settled()).toBe(false);
      expect(capturesOfChangedEnvironment()).toBe(0);
      expect((await pongAsync(fixture)).pid).toBe(before.pid);

      fixture.write(RELEASE_FILE, '');
      expectSuccess(await script.exchange);
      expect((await changed.exchange).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 1, retryAfterRestart: true }
      });
      const restarted = await fixture.host.restartCompleted;
      expect(restarted?.pid).not.toBe(before.pid);
    } finally {
      fixture.write(RELEASE_FILE, '');
      await closeRestartingFixtureAsync(fixture);
    }
  });
});

describe('the reason for a restart that waits for a served rushx script', () => {
  const actualCaptureAsync: typeof captureWorkspaceInputFingerprintAsync =
    jest.requireActual<typeof import('@microsoft/rush-lib')>(
      '@microsoft/rush-lib'
    ).captureWorkspaceInputFingerprintAsync;

  /** Makes every later capture of the workspace inputs report the given change. */
  function changeCapturedInputs(change: Partial<IWorkspaceInputFingerprint>): void {
    inputCaptureMock.mockImplementation(async (options) => ({
      ...(await actualCaptureAsync(options)),
      ...change
    }));
  }

  let changedImplementationPaths: jest.SpyInstance<ReadonlyArray<string>, []> | undefined;

  /** Makes every later capture find the given files of Rush or its plugins changed, in this order. */
  function changeImplementationFiles(fixture: DaemonGraphTestFixture, files: ReadonlyArray<string>): void {
    changeCapturedInputs({ runtimeHash: 'changed' });
    changedImplementationPaths = jest
      .spyOn(WorkspaceRuntimeFingerprintCache.prototype, 'changedPaths', 'get')
      .mockReturnValue(files.map((file: string) => path.join(fixture.folder, file)));
  }

  afterEach(() => {
    inputCaptureMock.mockImplementation(actualCaptureAsync);
    changedImplementationPaths?.mockRestore();
    changedImplementationPaths = undefined;
  });

  const PLUGIN_FILES: ReadonlyArray<string> = ['a', 'b', 'c', 'd'].map(
    (name: string) => `common/autoinstallers/plugins/node_modules/rush-plugin/lib/${name}.js`
  );

  it('leaves the changed installation files out of the reason of an install that restarts for another reason', async () => {
    const fixture: DaemonGraphTestFixture = await createServingFixtureAsync((created) => {
      // The install is never admitted, so no successor is launched.
      created.getSuccessorLaunchAsync = () => Promise.reject(new Error('No successor was expected.'));
    });
    try {
      expectSuccess(await fixture.runAsync(BUILD_A));
      const script: IServedScript = await serveAsync(fixture);

      // An install is expected to change the installation, so only the changed code makes it restart first.
      changeInstallation(fixture);
      changeImplementationFiles(fixture, PLUGIN_FILES.slice(0, 1));
      const install: IStreamedRequest = await startRequestAsync(fixture, ['install'], {
        admission: { waitTimeoutMs: 1500 }
      });
      const { terminal } = await install.exchange;
      expect(terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 1, admissionErrorCode: 'wait-timeout' }
      });
      expect((terminal.payload as IDaemonCommandResult).errorMessage).toContain(
        'The request was not admitted before the daemon could restart because the code of Rush or a Rush plugin ' +
          `changed (${PLUGIN_FILES[0]}).`
      );
      expect(install.positionPayloads).toEqual([
        {
          position: 1,
          requestId: install.requestId,
          restartReason: { kind: 'workspaceInputsChanged', implementationFiles: PLUGIN_FILES.slice(0, 1) },
          scriptCount: 1
        }
      ]);
      expect(script.settled()).toBe(false);

      fixture.write(RELEASE_FILE, '');
      expectSuccess(await script.exchange);
    } finally {
      inputCaptureMock.mockImplementation(actualCaptureAsync);
      fixture.write(RELEASE_FILE, '');
      await fixture[Symbol.asyncDispose]();
    }
  });

  it.each<
    [
      string,
      (fixture: DaemonGraphTestFixture) => Partial<IDaemonRequestEnvelope>,
      DaemonRestartReason,
      string
    ]
  >([
    [
      'a changed installation file',
      (fixture: DaemonGraphTestFixture) => {
        changeInstallation(fixture);
        return {};
      },
      { kind: 'workspaceInputsChanged', installationFiles: ['common/config/rush/npm-shrinkwrap.json'] },
      'because common/config/rush/npm-shrinkwrap.json changed'
    ],
    [
      'changed code of Rush or a Rush plugin',
      () => {
        changeCapturedInputs({ runtimeHash: 'changed' });
        return {};
      },
      // The capture found no changed file, since the test only changed its hash.
      { kind: 'workspaceInputsChanged', implementationFiles: [] },
      'because the code of Rush or a Rush plugin changed'
    ],
    [
      'at most 3 changed files of Rush or its plugins',
      (fixture: DaemonGraphTestFixture) => {
        changeImplementationFiles(fixture, PLUGIN_FILES);
        return {};
      },
      { kind: 'workspaceInputsChanged', implementationFiles: PLUGIN_FILES.slice(0, 3) },
      `because the code of Rush or a Rush plugin changed (${PLUGIN_FILES[0]}, ${PLUGIN_FILES[1]} and ` +
        `${PLUGIN_FILES[2]})`
    ],
    [
      'another Rush version',
      () => {
        changeCapturedInputs({ selectedRushVersion: '9.9.9' });
        return {};
      },
      { kind: 'workspaceInputsChanged', selectedRushVersion: '9.9.9' },
      'because this request selects Rush 9.9.9'
    ],
    [
      'a changed environment',
      (fixture: DaemonGraphTestFixture) => ({
        environment: { ...fixture.environment, RUSHD_RELOAD_TIER_TEST: 'changed' }
      }),
      { kind: 'environmentChanged', variableNames: ['RUSHD_RELOAD_TIER_TEST'] },
      "because this request's environment differs from the daemon's in RUSHD_RELOAD_TIER_TEST"
    ]
  ])(
    'names %s in the queue positions and the admission error of a build',
    async (inputs, change, reason, cause) => {
      const fixture: DaemonGraphTestFixture = await createServingFixtureAsync((created) => {
        // The build is never admitted, so no successor is launched.
        created.getSuccessorLaunchAsync = () => Promise.reject(new Error('No successor was expected.'));
      });
      try {
        expectSuccess(await fixture.runAsync(BUILD_A));
        const script: IServedScript = await serveAsync(fixture);

        const overrides: Partial<IDaemonRequestEnvelope> = change(fixture);
        const build: IStreamedRequest = await startRequestAsync(fixture, BUILD_A, {
          ...overrides,
          admission: { waitTimeoutMs: 1500 }
        });
        const { terminal } = await build.exchange;
        expect(terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 1, admissionErrorCode: 'wait-timeout' }
        });
        expect((terminal.payload as IDaemonCommandResult).errorMessage).toContain(
          `The request was not admitted before the daemon could restart ${cause}. The restart waits for the ` +
            'requests that the daemon is serving to finish, including a rushx script that may not exit until it ' +
            'is stopped. Stop the script, or use --wait-timeout <seconds> to wait longer.'
        );
        expect(build.positionPayloads).toEqual([
          { position: 1, requestId: build.requestId, restartReason: reason, scriptCount: 1 }
        ]);
        expect(script.settled()).toBe(false);

        fixture.write(RELEASE_FILE, '');
        expectSuccess(await script.exchange);
      } finally {
        inputCaptureMock.mockImplementation(actualCaptureAsync);
        fixture.write(RELEASE_FILE, '');
        await fixture[Symbol.asyncDispose]();
      }
    }
  );

  const INSTALLATION_FILE_CHANGED: DaemonRestartReason = {
    kind: 'workspaceInputsChanged',
    installationFiles: ['common/config/rush/npm-shrinkwrap.json']
  };

  /**
   * Changes an installation file once the next capture of the workspace inputs has read them. A build that needs a
   * reload then finds that it needs a restart only when it captures them again, while it holds the workspace
   * exclusively, so that it waits for the served scripts there rather than in the restart drain.
   */
  function changeInstallationAfterNextCapture(fixture: DaemonGraphTestFixture): void {
    changeProjectConfiguration(fixture);
    inputCaptureMock.mockImplementationOnce(async (options) => {
      const fingerprint: IWorkspaceInputFingerprint = await actualCaptureAsync(options);
      changeInstallation(fixture);
      return fingerprint;
    });
  }

  it('names the restart in the queue positions and the admission error of a build that finds it late', async () => {
    const fixture: DaemonGraphTestFixture = await createServingFixtureAsync((created) => {
      // The build is never admitted, so no successor is launched.
      created.getSuccessorLaunchAsync = () => Promise.reject(new Error('No successor was expected.'));
    });
    try {
      expectSuccess(await fixture.runAsync(BUILD_A));
      const script: IServedScript = await serveAsync(fixture);

      changeInstallationAfterNextCapture(fixture);
      const build: IStreamedRequest = await startRequestAsync(fixture, BUILD_A, {
        admission: { waitTimeoutMs: 1500 }
      });
      const { terminal } = await build.exchange;
      expect(terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 1, admissionErrorCode: 'wait-timeout' }
      });
      expect((terminal.payload as IDaemonCommandResult).errorMessage).toContain(
        'within its 1500ms wait timeout while waiting for a rushx script that this daemon runs to exit, before ' +
          'the daemon restarts because common/config/rush/npm-shrinkwrap.json changed.'
      );
      expect(build.positionPayloads).toEqual([
        { position: 1, requestId: build.requestId, restartReason: INSTALLATION_FILE_CHANGED, scriptCount: 1 }
      ]);
      expect(script.settled()).toBe(false);

      fixture.write(RELEASE_FILE, '');
      expectSuccess(await script.exchange);
    } finally {
      fixture.write(RELEASE_FILE, '');
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('names the restart in the script wait of a graph control request as well', async () => {
    const fixture: DaemonGraphTestFixture = await createServingFixtureAsync((created) => {
      // The request is never admitted, so no successor is launched.
      created.getSuccessorLaunchAsync = () => Promise.reject(new Error('No successor was expected.'));
    });
    // The restart drain before this wait waits for every served script, so the request finds one only if the drain
    // did not wait for it. Skipping the drain isolates the wait for the scripts.
    const drain: jest.SpiedFunction<RequestAdmissionController['waitForRestartDrainAsync']> = jest
      .spyOn(RequestAdmissionController.prototype, 'waitForRestartDrainAsync')
      .mockResolvedValue(true);
    try {
      expectSuccess(await fixture.runAsync(BUILD_A));
      const script: IServedScript = await serveAsync(fixture);

      changeInstallation(fixture);
      const pause: IStreamedRequest = await startRequestAsync(fixture, ['daemon', 'graph', 'pause'], {
        admission: { waitTimeoutMs: 1500 }
      });
      const { terminal } = await pause.exchange;
      expect(drain).toHaveBeenCalledTimes(1);
      expect(terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 1, admissionErrorCode: 'wait-timeout' }
      });
      expect((terminal.payload as IDaemonCommandResult).errorMessage).toContain(
        'within its 1500ms wait timeout while waiting for a rushx script that this daemon runs to exit, before ' +
          'the daemon restarts because common/config/rush/npm-shrinkwrap.json changed.'
      );
      expect(pause.positionPayloads).toEqual([
        { position: 1, requestId: pause.requestId, restartReason: INSTALLATION_FILE_CHANGED, scriptCount: 1 }
      ]);
      expect(script.settled()).toBe(false);

      fixture.write(RELEASE_FILE, '');
      expectSuccess(await script.exchange);
    } finally {
      drain.mockRestore();
      fixture.write(RELEASE_FILE, '');
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('counts down the scripts that such a build waits for, and restarts once the last one exits', async () => {
    const fixture: DaemonGraphTestFixture = await createServingFixtureAsync((created) => {
      setDaemonPolicy(created, {});
      created.getSuccessorLaunchAsync = getInstalledWorkspaceSuccessorLaunchAsync;
    });
    try {
      const before = await pongAsync(fixture);
      expectSuccess(await fixture.runAsync(BUILD_A));
      const script: IServedScript = await serveAsync(fixture);
      const script2: IServedScript = await serveAsync(fixture, 'serve2');

      changeInstallationAfterNextCapture(fixture);
      const build: IStreamedRequest = await startRequestAsync(fixture, BUILD_A, {
        admission: { waitTimeoutMs: 20_000 }
      });
      const waitingFor = (scriptCount: number): IDaemonRequestQueuePositionMessage['payload'] => ({
        position: scriptCount,
        requestId: build.requestId,
        restartReason: INSTALLATION_FILE_CHANGED,
        scriptCount
      });
      await waitForAsync(
        () => build.positionPayloads.length > 0 || build.settled(),
        'the build to wait for the scripts'
      );
      expect(build.positionPayloads).toEqual([waitingFor(2)]);

      fixture.write(RELEASE_FILE, '');
      expectSuccess(await script.exchange);
      await waitForAsync(
        () => build.positionPayloads.length > 1 || build.settled(),
        'the build to learn that a script exited'
      );
      expect(build.positionPayloads).toEqual([waitingFor(2), waitingFor(1)]);
      expect(build.settled()).toBe(false);

      fixture.write(LATE_RELEASE_FILE, '');
      expectSuccess(await script2.exchange);
      expect((await build.exchange).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 1, retryAfterRestart: true }
      });
      // The last script to exit admitted the build, which then waited for no script.
      expect(build.positionPayloads).toEqual([waitingFor(2), waitingFor(1)]);
      const restarted = await fixture.host.restartCompleted;
      expect(restarted?.pid).not.toBe(before.pid);
    } finally {
      fixture.write(RELEASE_FILE, '');
      fixture.write(LATE_RELEASE_FILE, '');
      await closeRestartingFixtureAsync(fixture);
    }
  });

  describe('a request queued behind a request that waits for the scripts (task 314)', () => {
    /**
     * The queue position of the first request queued behind the owner of a transition, which waits for
     * `scriptCount` scripts: the scripts and the owner are ahead of it.
     */
    function behind(
      request: IStreamedRequest,
      scriptCount: number,
      restartReason: DaemonRestartReason = INSTALLATION_FILE_CHANGED
    ): IDaemonRequestQueuePositionMessage['payload'] {
      return {
        position: scriptCount + 1,
        requestId: request.requestId,
        restartReason,
        scriptCount,
        restartsForAnotherRequest: true
      };
    }

    async function waitForPositionsAsync(
      request: IStreamedRequest,
      count: number,
      description: string
    ): Promise<void> {
      await waitForAsync(() => request.positionPayloads.length >= count || request.settled(), description);
    }

    it("serves a build with the daemon's environment while a build drains to restart for its own (task 314)", async () => {
      const fixture: DaemonGraphTestFixture = await createServingFixtureAsync((created) => {
        setDaemonPolicy(created, {});
        created.getSuccessorLaunchAsync = getInstalledWorkspaceSuccessorLaunchAsync;
      });
      try {
        expectSuccess(await fixture.runAsync(BUILD_A));
        const script: IServedScript = await serveAsync(fixture);

        // A changed environment is found at the first capture, so the build waits for the script in the restart
        // drain, before it owns a transition, and a request that matches this process is still served meanwhile.
        const restart: IStreamedRequest = await startRequestAsync(fixture, BUILD_A, {
          environment: { ...fixture.environment, RUSHD_RELOAD_TIER_TEST: 'changed' },
          admission: { waitTimeoutMs: 20_000 }
        });
        await waitForPositionsAsync(restart, 1, 'the build to drain for its restart');
        const build: IStreamedRequest = await startRequestAsync(fixture, BUILD_A, {
          admission: { waitTimeoutMs: 500 }
        });
        expectSuccess(await build.exchange);
        expect(build.positionPayloads).toEqual([]);
        expect(restart.settled()).toBe(false);

        fixture.write(RELEASE_FILE, '');
        expectSuccess(await script.exchange);
        expect((await restart.exchange).terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 1, retryAfterRestart: true }
        });
      } finally {
        fixture.write(RELEASE_FILE, '');
        await closeRestartingFixtureAsync(fixture);
      }
    });

    it('names the script and the restart to a build queued behind a build that finds the restart late (task 314)', async () => {
      const fixture: DaemonGraphTestFixture = await createServingFixtureAsync((created) => {
        // Neither build is admitted, so no successor is launched.
        created.getSuccessorLaunchAsync = () => Promise.reject(new Error('No successor was expected.'));
      });
      try {
        expectSuccess(await fixture.runAsync(BUILD_A));
        const script: IServedScript = await serveAsync(fixture);

        changeInstallationAfterNextCapture(fixture);
        const owner: IStreamedRequest = await startRequestAsync(fixture, BUILD_A, {
          admission: { waitTimeoutMs: 3000 }
        });
        await waitForPositionsAsync(owner, 1, 'the build to wait for the script');
        const build: IStreamedRequest = await startRequestAsync(fixture, BUILD_A, {
          admission: { waitTimeoutMs: 500 }
        });
        const { terminal } = await build.exchange;
        expect(terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 1, admissionErrorCode: 'wait-timeout' }
        });
        expect((terminal.payload as IDaemonCommandResult).errorMessage).toContain(
          'The request was not admitted within its 500ms wait timeout while waiting for another request that ' +
            'waits for 1 rushx script that this daemon runs to exit before it restarts the daemon because ' +
            'common/config/rush/npm-shrinkwrap.json changed. Use --wait-timeout <seconds> to wait longer.'
        );
        expect(build.positionPayloads).toEqual([behind(build, 1)]);

        // The build that waits for the script is told what it was told before.
        expect((await owner.exchange).terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 1, admissionErrorCode: 'wait-timeout' }
        });
        expect(owner.positionPayloads).toEqual([
          {
            position: 1,
            requestId: owner.requestId,
            restartReason: INSTALLATION_FILE_CHANGED,
            scriptCount: 1
          }
        ]);
        expect(script.settled()).toBe(false);

        fixture.write(RELEASE_FILE, '');
        expectSuccess(await script.exchange);
      } finally {
        fixture.write(RELEASE_FILE, '');
        await fixture[Symbol.asyncDispose]();
      }
    });

    it('counts down the scripts to a build queued behind such a build, and both retry after the restart (task 314)', async () => {
      const fixture: DaemonGraphTestFixture = await createServingFixtureAsync((created) => {
        setDaemonPolicy(created, {});
        created.getSuccessorLaunchAsync = getInstalledWorkspaceSuccessorLaunchAsync;
      });
      try {
        const before = await pongAsync(fixture);
        expectSuccess(await fixture.runAsync(BUILD_A));
        const script: IServedScript = await serveAsync(fixture);
        const script2: IServedScript = await serveAsync(fixture, 'serve2');

        changeInstallationAfterNextCapture(fixture);
        const owner: IStreamedRequest = await startRequestAsync(fixture, BUILD_A, {
          admission: { waitTimeoutMs: 20_000 }
        });
        await waitForPositionsAsync(owner, 1, 'the build to wait for the scripts');
        const build: IStreamedRequest = await startRequestAsync(fixture, BUILD_A, {
          admission: { waitTimeoutMs: 20_000 }
        });
        await waitForPositionsAsync(build, 1, 'the queued build to learn of the scripts');
        expect(build.positionPayloads).toEqual([behind(build, 2)]);

        fixture.write(RELEASE_FILE, '');
        expectSuccess(await script.exchange);
        await waitForPositionsAsync(build, 2, 'the queued build to learn that a script exited');
        expect(build.positionPayloads).toEqual([behind(build, 2), behind(build, 1)]);
        expect(build.settled()).toBe(false);

        fixture.write(LATE_RELEASE_FILE, '');
        expectSuccess(await script2.exchange);
        for (const request of [owner, build]) {
          expect((await request.exchange).terminal).toMatchObject({
            kind: 'requestResult',
            payload: { exitCode: 1, retryAfterRestart: true }
          });
        }
        // Once the last script exited, the queued build waited only for the build ahead of it.
        expect(build.positionPayloads).toEqual([
          behind(build, 2),
          behind(build, 1),
          { position: 1, requestId: build.requestId }
        ]);
        const restarted = await fixture.host.restartCompleted;
        expect(restarted?.pid).not.toBe(before.pid);
      } finally {
        fixture.write(RELEASE_FILE, '');
        fixture.write(LATE_RELEASE_FILE, '');
        await closeRestartingFixtureAsync(fixture);
      }
    });

    it.each([{ commandName: 'install' }, { commandName: 'update' }])(
      'names the script and the $commandName to a build queued behind a native $commandName (task 314)',
      async ({ commandName }) => {
        const fixture: DaemonGraphTestFixture = await createServingFixtureAsync((created) => {
          // The mutation is never admitted, so no successor is launched.
          created.getSuccessorLaunchAsync = () => Promise.reject(new Error('No successor was expected.'));
        });
        try {
          expectSuccess(await fixture.runAsync(BUILD_A));
          const script: IServedScript = await serveAsync(fixture);

          const mutation: IStreamedRequest = await startRequestAsync(fixture, [commandName], {
            admission: { waitTimeoutMs: 3000 }
          });
          await waitForPositionsAsync(mutation, 1, `the ${commandName} to wait for the script`);
          const build: IStreamedRequest = await startRequestAsync(fixture, BUILD_A, {
            admission: { waitTimeoutMs: 500 }
          });
          const { terminal } = await build.exchange;
          expect(terminal).toMatchObject({
            kind: 'requestResult',
            payload: { exitCode: 1, admissionErrorCode: 'wait-timeout' }
          });
          expect((terminal.payload as IDaemonCommandResult).errorMessage).toContain(
            'The request was not admitted within its 500ms wait timeout while waiting for another request that ' +
              'waits for 1 rushx script that this daemon runs to exit before it restarts the daemon because it ' +
              `runs rush ${commandName}. Use --wait-timeout <seconds> to wait longer.`
          );
          expect(build.positionPayloads).toEqual([behind(build, 1, { kind: 'nativeMutation', commandName })]);

          // The mutation is told what it was told before.
          expect((await mutation.exchange).terminal).toMatchObject({
            kind: 'requestResult',
            payload: { exitCode: 1, admissionErrorCode: 'wait-timeout' }
          });
          expect(mutation.positionPayloads).toEqual([
            { position: 1, requestId: mutation.requestId, scriptCount: 1 }
          ]);
          expect(script.settled()).toBe(false);

          fixture.write(RELEASE_FILE, '');
          expectSuccess(await script.exchange);
          // The refused requests left the workspace serving builds.
          expectSuccess(await fixture.runAsync(BUILD_A));
        } finally {
          fixture.write(RELEASE_FILE, '');
          await fixture[Symbol.asyncDispose]();
        }
      }
    );
  });
});
