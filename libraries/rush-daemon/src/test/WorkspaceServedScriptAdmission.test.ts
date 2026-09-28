// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { WorkspaceInputChangeTier } from '@microsoft/rush-lib';
import {
  DaemonFrameType,
  decodeDaemonControlMessage,
  type DaemonControlMessage,
  type IDaemonFrame,
  type IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';

import { getInstalledWorkspaceSuccessorLaunchAsync } from '../WorkspaceProcessRestart';
import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';
import type { DaemonRequestWireClient, ITerminalExchange } from './DaemonRequestWireTestUtilities';
import { pongAsync, setDaemonPolicy } from './WarmGenerationTestUtilities';
import { stopSuccessorAsync } from './WorkspaceLifecycleTestProcess';

jest.setTimeout(60_000);

const BUILD_A: string[] = ['build', '--to', 'a', '--parallelism', '3'];
const RELEASE_FILE: string = 'release-serve';
const LATE_RELEASE_FILE: string = 'release-serve2';

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
      "const fs=require('node:fs');const n=process.argv[2]||'serve';fs.appendFileSync('../runs.txt',n+'-start\\n');" +
        "const t=setInterval(()=>{if(fs.existsSync('../release-'+n)){clearInterval(t);" +
        "fs.appendFileSync('../runs.txt',n+'-end\\n');}},20);"
    );
    configure?.(created);
  });
}

interface IServedScript {
  readonly exchange: Promise<ITerminalExchange>;
  readonly settled: () => boolean;
}

async function serveAsync(fixture: DaemonGraphTestFixture): Promise<IServedScript> {
  let settled: boolean = false;
  const exchange: Promise<ITerminalExchange> = fixture
    .runAsync(['serve'], {
      commandOrigin: 'custom',
      invocationKind: 'rushx',
      cwd: path.join(fixture.folder, 'a')
    })
    .finally(() => {
      settled = true;
    });
  await waitForAsync(() => fixture.runs().includes('serve-start') || settled, 'the served script to start');
  expect(settled).toBe(false);
  return { exchange, settled: () => settled };
}

interface IStreamedRequest {
  readonly exchange: Promise<ITerminalExchange>;
  /** The queue positions that the daemon has reported so far. */
  readonly positions: ReadonlyArray<number>;
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
  let settled: boolean = false;
  const readAsync = async (): Promise<ITerminalExchange> => {
    const frames: IDaemonFrame[] = [];
    try {
      for (;;) {
        const frame: IDaemonFrame = await client.readFrameAsync();
        frames.push(frame);
        if (frame.kind !== DaemonFrameType.controlJson) continue;
        const message: DaemonControlMessage = decodeDaemonControlMessage(frame.payload);
        if (message.kind === 'queuePosition') positions.push(message.payload.position);
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
  return { exchange, positions, settled: () => settled };
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
      // The reload used to wait for #gate until the script exited (#113).
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

      const install: ITerminalExchange = await fixture.runAsync(['install'], {
        admission: { waitTimeoutMs: 500 }
      });
      expect(install.terminal).toMatchObject({
        kind: 'requestResult',
        payload: {
          exitCode: 1,
          admissionErrorCode: 'wait-timeout',
          errorMessage: expect.stringContaining(
            'within its 500ms wait timeout while waiting for a rushx script that this daemon runs to exit.'
          )
        }
      });
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
      // The script keeps its restart ticket after it releases #gate, so the restart still drains it (#198).
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
      // The later script used to start and keep the restart waiting until it exited (#96).
      expect(fixture.runs()).not.toContain('serve2-start');
      // It waits for the served script and the restart.
      expect(late.positions).toEqual([2]);

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
