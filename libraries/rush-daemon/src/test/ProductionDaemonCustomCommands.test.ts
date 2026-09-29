// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { IOperationGraph } from '@microsoft/rush-lib';
import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';

import { type IRequestLease, RequestExclusivityClass } from '../RequestScheduler';
import { getWorkspaceRequestScheduler } from '../WorkspaceRequestAdmission';
import {
  ClassRecordingResolver,
  createFixtureAsync,
  requestEnvironment,
  runAsync,
  runs,
  type IFixture
} from './NativeEngineTestFixture';

jest.setTimeout(30_000);

describe('native production daemon engine', () => {
  it('serves phased commands from command-line.json on a shared graph with their own admission class', async () => {
    const classes: string[] = [];
    const fixture: IFixture = await createFixtureAsync(false, 'direct', {
      customCommands: true,
      resolver: new ClassRecordingResolver(classes)
    });
    const custom: Partial<IDaemonRequestEnvelope> = { commandOrigin: 'custom' };
    try {
      expect((await runAsync(fixture, 'test', ['test', '--only', 'a'], custom)).terminal).toMatchObject({
        kind: 'requestResult',
        payload: {
          exitCode: 0,
          scheduled: true,
          operationResults: [
            { operationId: 'a (compile)', status: 'SUCCESS' },
            { operationId: 'a (test)', status: 'SUCCESS' }
          ]
        }
      });
      const testGraph: IOperationGraph | undefined = fixture.session.operationGraph;
      expect(testGraph?.operations.size).toBe(6);
      expect((await runAsync(fixture, 'warm-test', ['test', '--only', 'a'], custom)).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: false }
      });
      expect(fixture.session.operationGraph).toBe(testGraph);
      expect(runs(fixture)).toEqual(['a:one:', 'test-a']);

      // Like rebuild, retest runs every selected operation on every request, here on the engine of test.
      for (const id of ['retest-one', 'retest-two']) {
        expect((await runAsync(fixture, id, ['retest', '--only', 'a'], custom)).terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 0, scheduled: true }
        });
      }
      expect(fixture.session.operationGraph).toBe(testGraph);
      expect(runs(fixture)).toEqual(['a:one:', 'test-a', 'a:one:', 'test-a', 'a:one:', 'test-a']);

      // Clients mark only build and rebuild as built-in commands.
      expect((await runAsync(fixture, 'built-in-test', ['test', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestRejected',
        payload: { code: 'invalidRequest' }
      });
      // A generation reload also resolves its first request once to bind the engine.
      expect(new Set(classes)).toEqual(new Set(['test:SHARED-BUILD', 'retest:EXCLUSIVE']));
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('rejects other commands before reading inputs and serves custom commands despite build event hooks', async () => {
    const fixture: IFixture = await createFixtureAsync(false, 'direct', {
      customCommands: true,
      buildEventHook: true
    });
    const custom: Partial<IDaemonRequestEnvelope> = { commandOrigin: 'custom' };
    try {
      expect((await runAsync(fixture, 'hooked-build', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestRejected',
        payload: { code: 'unsupported', message: expect.stringContaining('event-hook') }
      });
      expect((await runAsync(fixture, 'test', ['test', '--only', 'a'], custom)).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: true }
      });
      const graph: IOperationGraph | undefined = fixture.session.operationGraph;
      // A served command would reload the graph for this change; a command that cannot be served must not.
      const filename: string = path.join(fixture.repoRoot, 'projects/a/package.json');
      const json: { scripts: Record<string, string> } = JSON.parse(fs.readFileSync(filename, 'utf8'));
      json.scripts['_phase:compile'] = 'node build.cjs --changed';
      fs.writeFileSync(filename, JSON.stringify(json));
      expect((await runAsync(fixture, 'global', ['hello'], custom)).terminal).toMatchObject({
        kind: 'requestRejected',
        payload: { code: 'unsupported', message: expect.stringContaining('is not a phased command') }
      });
      expect((await runAsync(fixture, 'list', ['list'], custom)).terminal).toMatchObject({
        kind: 'requestRejected',
        payload: { code: 'unsupported', message: '"list" is a built-in command that is not phased.' }
      });
      expect(fixture.session.operationGraph).toBe(graph);
      expect((await runAsync(fixture, 'changed', ['test', '--only', 'a'], custom)).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: true }
      });
      expect(fixture.session.operationGraph).not.toBe(graph);
      expect(runs(fixture)).toEqual(['a:one:', 'test-a', 'a:one:--changed', 'test-a']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('admits a custom command to the workspace with the class of its command', async () => {
    const fixture: IFixture = await createFixtureAsync(false, 'direct', { customCommands: true });
    const custom: Partial<IDaemonRequestEnvelope> = { commandOrigin: 'custom' };
    const noWait: Partial<IDaemonRequestEnvelope> = { ...custom, admission: { noWait: true } };
    try {
      expect((await runAsync(fixture, 'test', ['test', '--only', 'a'], custom)).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: true }
      });
      const sharedBuild: IRequestLease = await getWorkspaceRequestScheduler(fixture.session).acquireAsync({
        exclusivityClass: RequestExclusivityClass.SharedBuild
      });
      try {
        // test is incremental, so it shares admission with builds. retest is not, so it waits for them.
        expect((await runAsync(fixture, 'shared', ['test', '--only', 'a'], noWait)).terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 0, scheduled: false }
        });
        expect(
          (await runAsync(fixture, 'exclusive', ['retest', '--only', 'a'], noWait)).terminal
        ).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 1, admissionErrorCode: 'no-wait' }
        });
      } finally {
        sharedBuild.release();
      }
      expect(runs(fixture)).toEqual(['a:one:', 'test-a']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('rejects a global command before its environment can restart the daemon', async () => {
    const fixture: IFixture = await createFixtureAsync(false, 'direct', { customCommands: true });
    // A variable that is part of the workspace fingerprint environment.
    const environment: Record<string, string> = {
      ...requestEnvironment(),
      RUSHD_CUSTOM_COMMAND_TEST: 'changed'
    };
    try {
      expect(
        (await runAsync(fixture, 'global', ['hello'], { commandOrigin: 'custom', environment })).terminal
      ).toMatchObject({ kind: 'requestRejected', payload: { code: 'unsupported' } });
      // A build with this environment needs a new daemon process, which this host cannot launch.
      expect(
        (await runAsync(fixture, 'build', ['build', '--only', 'a'], { environment })).terminal
      ).toMatchObject({
        kind: 'requestRejected',
        payload: {
          code: 'routingFailed',
          message: expect.stringContaining('A new daemon process is required (environment)')
        }
      });
      expect(runs(fixture)).toEqual([]);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });
});
