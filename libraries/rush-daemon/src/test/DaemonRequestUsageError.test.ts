// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IOperationGraph } from '@microsoft/rush-lib';
import { LockFile } from '@rushstack/node-core-library';
import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';

import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';

// These cases start real hosts and run Git/build subprocesses rather than mocked unit work.
jest.setTimeout(30_000);

const message: string = 'rush build: error: Unrecognized arguments: --nope.';
const invalid: string[] = ['build', '--to', 'b', '--nope'];
// Native Rush prints the usage of the command to stdout before the message.
const usageFailure: object = {
  kind: 'requestResult',
  payload: {
    exitCode: 2,
    outcome: 'failure',
    aborted: false,
    errorMessage: message,
    usage: expect.stringMatching(/^usage: rush build \[-h\] .*\[-t PROJECT\]/s)
  }
};
const inProcess: object = { kind: 'requestRejected', payload: { code: 'unsupported', message } };
const success: object = { kind: 'requestResult', payload: { exitCode: 0 } };

function experimentsJson(useIPCScriptsInWatchMode: boolean): string {
  return JSON.stringify({ useIPCScriptsInWatchMode });
}

it('fails an invalid command line with the exit code of native Rush instead of handing it to in-process Rush', async () => {
  const fixture: DaemonGraphTestFixture = await DaemonGraphTestFixture.createAsync();
  try {
    // Until a build binds a session, the daemon has not checked the configuration that it loaded at startup.
    expect((await fixture.runAsync(invalid)).terminal).toMatchObject(inProcess);
    expect((await fixture.buildAsync()).terminal).toMatchObject(success);
    const generation: number = fixture.host.workspaceGeneration;
    const graph: IOperationGraph | undefined = fixture.session.operationGraph;
    expect((await fixture.runAsync(invalid)).terminal).toMatchObject(usageFailure);
    expect(fixture.host.workspaceGeneration).toBe(generation);
    expect(fixture.session.operationGraph).toBe(graph);
    // The daemon answers only for a command line that starts with the requested command.
    const globalFlag: string[] = ['--debug', ...invalid];
    expect((await fixture.runAsync(globalFlag, { commandName: 'build' })).terminal).toMatchObject(inProcess);
    expect((await fixture.buildAsync()).terminal).toMatchObject(success);
    expect(fixture.session.operationGraph).toBe(graph);
    expect(fixture.runs()).toEqual(['a', 'b']);
  } finally {
    await fixture[Symbol.asyncDispose]();
  }
});

it('answers an invalid command line of a custom phased command as it does one of build, and of no other custom command', async () => {
  const fixture: DaemonGraphTestFixture = await DaemonGraphTestFixture.createAsync((created) => {
    created.write(
      'common/config/rush/command-line.json',
      JSON.stringify({
        phases: [{ name: '_phase:compile', dependencies: { upstream: ['_phase:compile'] } }],
        commands: [
          {
            commandKind: 'phased',
            name: 'build',
            phases: ['_phase:compile'],
            incremental: true,
            enableParallelism: true
          },
          {
            commandKind: 'phased',
            name: 'test',
            summary: 'Builds and tests',
            phases: ['_phase:compile'],
            incremental: true,
            enableParallelism: true
          },
          { commandKind: 'global', name: 'hello', summary: 'Hello', shellCommand: 'echo hello' }
        ]
      })
    );
  });
  try {
    const custom: Partial<IDaemonRequestEnvelope> = { commandOrigin: 'custom' };
    const testMessage: string = 'rush test: error: Unrecognized arguments: --nope.';
    const invalidTest: string[] = ['test', '--to', 'b', '--nope'];
    // A custom command is parsed before the input capture, but its usage error waits for the same check as build's.
    expect((await fixture.runAsync(invalidTest, custom)).terminal).toMatchObject({
      kind: 'requestRejected',
      payload: { code: 'unsupported', message: testMessage }
    });
    expect((await fixture.buildAsync()).terminal).toMatchObject(success);
    expect((await fixture.runAsync(invalidTest, custom)).terminal).toMatchObject({
      kind: 'requestResult',
      payload: {
        exitCode: 2,
        outcome: 'failure',
        aborted: false,
        errorMessage: testMessage,
        usage: expect.stringMatching(/^usage: rush test \[-h\] /)
      }
    });
    // The daemon serves no global or unknown command, so in-process Rush reports its invalid command line.
    for (const argv of [
      ['hello', '--nope'],
      ['nope', '--to', 'b']
    ]) {
      expect((await fixture.runAsync(argv, custom)).terminal).toMatchObject({
        kind: 'requestRejected',
        payload: { code: 'unsupported' }
      });
    }
    expect(fixture.runs()).toEqual(['a', 'b']);
  } finally {
    await fixture[Symbol.asyncDispose]();
  }
});

it('hands an invalid command line to in-process Rush after a configuration change, which parses it again', async () => {
  const fixture: DaemonGraphTestFixture = await DaemonGraphTestFixture.createAsync();
  try {
    expect((await fixture.buildAsync()).terminal).toMatchObject(success);
    // The warm session's configuration may be stale, for example without a parameter that experiments.json adds.
    fixture.write(
      'a/package.json',
      JSON.stringify({
        name: 'a',
        version: '1.0.0',
        scripts: { '_phase:compile': 'node build.cjs --changed' }
      })
    );
    expect((await fixture.runAsync(invalid)).terminal).toMatchObject(inProcess);
    expect((await fixture.buildAsync()).terminal).toMatchObject(success);
    expect((await fixture.runAsync(invalid)).terminal).toMatchObject(usageFailure);
    expect(fixture.runs()).toEqual(['a', 'b', 'a', 'b']);
  } finally {
    await fixture[Symbol.asyncDispose]();
  }
});

it('hands an invalid command line to in-process Rush while the warm set waits for a reload that found the Rush lock busy', async () => {
  const fixture: DaemonGraphTestFixture = await DaemonGraphTestFixture.createAsync();
  try {
    expect((await fixture.buildAsync()).terminal).toMatchObject(success);
    expect((await fixture.runAsync(invalid)).terminal).toMatchObject(usageFailure);
    // A graph-affecting parameter needs a reload (the engine of build serves --ignore-hooks itself). The reload
    // stops the warm set before it takes the Rush lock, which this test holds.
    const native: LockFile | undefined = LockFile.tryAcquire(
      fixture.session.rushConfiguration.commonTempFolder,
      'rush'
    );
    expect(native).toBeDefined();
    try {
      expect(
        (await fixture.runAsync(['build', '--to', 'b', '--changed-projects-only'])).terminal
      ).toMatchObject({
        kind: 'requestRejected',
        payload: { message: expect.stringContaining('Another Rush command') }
      });
    } finally {
      native?.release();
    }
    // The inputs did not change, but the daemon answers again only after a build reloads.
    expect((await fixture.runAsync(invalid)).terminal).toMatchObject(inProcess);
    expect((await fixture.buildAsync()).terminal).toMatchObject(success);
    expect((await fixture.runAsync(invalid)).terminal).toMatchObject(usageFailure);
  } finally {
    await fixture[Symbol.asyncDispose]();
  }
});

it('hands an invalid command line to in-process Rush when the configuration changed while the daemon started', async () => {
  const fixture: DaemonGraphTestFixture = await DaemonGraphTestFixture.createAsync((created) => {
    // A build that has watch phases gets --no-ipc when experiments.json turns on useIPCScriptsInWatchMode.
    created.write(
      'common/config/rush/command-line.json',
      JSON.stringify({
        phases: [{ name: '_phase:compile', dependencies: { upstream: ['_phase:compile'] } }],
        commands: [
          {
            commandKind: 'phased',
            name: 'build',
            phases: ['_phase:compile'],
            incremental: true,
            enableParallelism: true,
            watchOptions: { alwaysWatch: false, watchPhases: ['_phase:compile'] }
          }
        ]
      })
    );
    created.write('common/config/rush/experiments.json', experimentsJson(false));
    created.afterCreateSessionAsync = async () => {
      created.afterCreateSessionAsync = undefined;
      // The startup capture reads this edit, but the session that the daemon loaded read experiments.json before it.
      created.write('common/config/rush/experiments.json', experimentsJson(true));
    };
  });
  try {
    const noIpc: string[] = ['build', '--to', 'b', '--no-ipc'];
    expect((await fixture.runAsync(noIpc)).terminal).toMatchObject({
      kind: 'requestRejected',
      payload: { code: 'unsupported', message: 'rush build: error: Unrecognized arguments: --no-ipc.' }
    });
    // The first build binds a session that reads the edited experiments.json.
    expect((await fixture.buildAsync()).terminal).toMatchObject(success);
    expect((await fixture.runAsync(noIpc)).terminal).toMatchObject(success);
    expect(fixture.runs()).toEqual(['a', 'b']);
  } finally {
    await fixture[Symbol.asyncDispose]();
  }
});
