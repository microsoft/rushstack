// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import {
  DaemonFrameType,
  decodeDaemonControlMessage,
  type IDaemonFrame,
  type IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';

import { getInstalledWorkspaceSuccessorLaunchAsync } from '../WorkspaceProcessRestart';
import { DaemonGraphTestFixture, withScriptDeadline } from './DaemonGraphTestFixture';
import type { DaemonRequestWireClient, ITerminalExchange } from './DaemonRequestWireTestUtilities';
import { pongAsync, setDaemonPolicy } from './WarmGenerationTestUtilities';
import { stopSuccessorAsync } from './WorkspaceLifecycleTestProcess';

jest.setTimeout(60_000);

const BUILD_B: string[] = ['build', '--to', 'b', '--parallelism', '3'];
const BUILD_C: string[] = ['build', '--to', 'c', '--parallelism', '3'];

interface IQueuedRequest {
  readonly client: DaemonRequestWireClient;
  readonly envelope: IDaemonRequestEnvelope;
}

function isQueuePosition(frame: IDaemonFrame): boolean {
  return (
    frame.kind === DaemonFrameType.controlJson &&
    decodeDaemonControlMessage(frame.payload).kind === 'queuePosition'
  );
}

/** Starts a request and returns once the daemon reports that it waits. */
async function startQueuedAsync(
  fixture: DaemonGraphTestFixture,
  environment: Record<string, string>,
  clients: DaemonRequestWireClient[]
): Promise<IQueuedRequest> {
  const client: DaemonRequestWireClient = await fixture.connectAsync();
  clients.push(client);
  const envelope: IDaemonRequestEnvelope = fixture.envelope(BUILD_B, { environment });
  await client.sendControlAsync({ kind: 'requestStart', payload: envelope });
  while (!isQueuePosition(await client.readFrameAsync()));
  return { client, envelope };
}

it('tells the request that restarts the daemon for its environment, and each request answered while that restart is pending, which variables differ', async () => {
  const fixture = await DaemonGraphTestFixture.createAsync((created) => {
    setDaemonPolicy(created, {});
    created.getSuccessorLaunchAsync = getInstalledWorkspaceSuccessorLaunchAsync;
    // Project c holds its build open until the test removes the marker.
    created.write('hold', '');
    created.write(
      'c/build.cjs',
      withScriptDeadline(
        "const fs=require('node:fs');fs.appendFileSync('../runs.txt','c\\n');" +
          "const t=setInterval(()=>{if(!fs.existsSync('../hold')){clearInterval(t);console.log('finished-c');}},20);"
      )
    );
  });
  const clients: DaemonRequestWireClient[] = [];
  try {
    const before = await pongAsync(fixture);
    const held: Promise<ITerminalExchange> = fixture.runAsync(BUILD_C);
    const deadline: number = Date.now() + 30_000;
    while (!fixture.runs().includes('c') && Date.now() < deadline) await delayAsync(20);
    expect(fixture.runs()).toContain('c');

    // Each request differs from the daemon in its own variable. Either one may restart the daemon; the other is
    // answered while that restart is pending.
    const requests: IQueuedRequest[] = [];
    for (const [name, value] of [
      ['RUSHD_RESTART_REASON_FIRST', 'first-value'],
      ['RUSHD_RESTART_REASON_SECOND', 'second-value']
    ]) {
      requests.push(await startQueuedAsync(fixture, { ...fixture.environment, [name]: value }, clients));
    }
    fs.rmSync(path.join(fixture.folder, 'hold'));
    expect((await held).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
    const exchanges: ITerminalExchange[] = await Promise.all(
      requests.map(({ client, envelope }: IQueuedRequest) => client.readTerminalAsync(envelope.requestId))
    );

    const restartLines: string[] = fixture.logs.filter((line: string) =>
      line.startsWith('rushd: restarting for request ')
    );
    expect(restartLines).toHaveLength(1);
    const restarter: number = requests.findIndex(({ envelope }: IQueuedRequest) =>
      restartLines[0].includes(`request ${envelope.requestId},`)
    );
    expect(restarter).not.toBe(-1);
    const variableName: string =
      restarter === 0 ? 'RUSHD_RESTART_REASON_FIRST' : 'RUSHD_RESTART_REASON_SECOND';
    expect(restartLines[0]).toBe(
      `rushd: restarting for request ${requests[restarter].envelope.requestId}, whose environment differs ` +
        `from this daemon's in ${variableName}`
    );
    // The request that was answered while the restart was pending learns the restart's reason, not its own.
    for (const { terminal } of exchanges) {
      expect(terminal).toMatchObject({
        kind: 'requestResult',
        payload: {
          exitCode: 1,
          retryAfterRestart: true,
          restartReason: { kind: 'environmentChanged', variableNames: [variableName] }
        }
      });
    }
    expect(fixture.logs.join('\n')).not.toMatch(/first-value|second-value/);
    const restarted = await fixture.host.restartCompleted;
    expect(restarted?.pid).not.toBe(before.pid);
    expect(fixture.runs()).toEqual(['c']);
  } finally {
    fs.rmSync(path.join(fixture.folder, 'hold'), { force: true });
    await Promise.all(clients.map((client: DaemonRequestWireClient) => client.closeAsync()));
    try {
      await fixture.host.closeAsync();
      await fixture.host.restartCompleted;
    } finally {
      await stopSuccessorAsync(fixture.host.paths);
      await fixture[Symbol.asyncDispose]();
    }
  }
});
