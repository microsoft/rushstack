// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { PhasedCommandEngine, type IPhasedCommandEngine, type RushConfiguration } from '@microsoft/rush-lib';
import type { IDaemonPongMessage } from '@rushstack/rush-daemon-protocol';
import { NoOpTerminalProvider } from '@rushstack/terminal';

import { WorkspaceWarmSet, type WorkspaceWarmSetConfiguration } from '../WorkspaceWarmSet';
import { WorkspaceSession, type IWorkspaceSessionOptions } from '../WorkspaceSession';
import { WorkspaceSessionFileWatcher } from '../WorkspaceSessionFileWatcher';
import type { DaemonGraphTestFixture } from './DaemonGraphTestFixture';

export const GENERATION_POLICY: WorkspaceWarmSetConfiguration = {
  warmIdleTimeoutSeconds: 300,
  warmMemoryBudgetMB: 100_000,
  warmSetMaxProjects: 20,
  autoWarmByTelemetry: false
};

export function setDaemonPolicy(
  fixture: DaemonGraphTestFixture,
  configuration: WorkspaceWarmSetConfiguration
): void {
  const json: Record<string, unknown> = JSON.parse(
    fs.readFileSync(path.join(fixture.folder, 'rush.json'), 'utf8')
  );
  fixture.write('rush.json', JSON.stringify({ ...json, daemon: { ...GENERATION_POLICY, ...configuration } }));
}

export function getWarmSet(fixture: DaemonGraphTestFixture): WorkspaceWarmSet {
  const graph = fixture.session.operationGraph;
  const warm: WorkspaceWarmSet | undefined = graph && WorkspaceWarmSet.getAttached(graph);
  if (!warm) throw new Error('Expected the session-owned controller on the real native graph.');
  return warm;
}

export async function pongAsync(fixture: DaemonGraphTestFixture): Promise<IDaemonPongMessage['payload']> {
  const client = await fixture.connectAsync();
  try {
    await client.sendControlAsync({ kind: 'ping', payload: {} });
    const message = await client.readControlAsync();
    if (message.kind !== 'pong') throw new Error('Expected a real daemon pong.');
    return message.payload;
  } finally {
    await client.closeAsync();
  }
}

export async function createNativeEngineAsync(
  configuration: RushConfiguration
): Promise<IPhasedCommandEngine> {
  const command: PhasedCommandEngine = await PhasedCommandEngine.parseAsync({
    argv: ['build', '--parallelism', '3'],
    cwd: configuration.rushJsonFolder,
    rushConfiguration: configuration,
    terminalProvider: new NoOpTerminalProvider()
  });
  return await command.createEngineAsync();
}

export async function createObservedSessionAsync(
  options: IWorkspaceSessionOptions
): Promise<{ session: WorkspaceSession; watcher: WorkspaceSessionFileWatcher }> {
  let watcher: WorkspaceSessionFileWatcher | undefined;
  const start = WorkspaceSessionFileWatcher.prototype.startAsync;
  const capture = jest
    .spyOn(WorkspaceSessionFileWatcher.prototype, 'startAsync')
    .mockImplementation(function (
      this: WorkspaceSessionFileWatcher,
      onInvalidation: (changedPath?: string) => void
    ): Promise<void> {
      watcher = this;
      return start.call(this, onInvalidation);
    });
  try {
    const session: WorkspaceSession = await WorkspaceSession.createAsync(options);
    if (!watcher) throw new Error('Expected the real workspace watcher.');
    return { session, watcher };
  } finally {
    capture.mockRestore();
  }
}

export async function eventuallyAsync(assertion: () => void): Promise<void> {
  const deadline: number = performance.now() + 5000;
  for (;;) {
    try {
      assertion();
      return;
    } catch (error) {
      if (performance.now() >= deadline) throw error;
      await delayAsync(10);
    }
  }
}
