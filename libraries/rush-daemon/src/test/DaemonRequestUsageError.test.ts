// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IOperationGraph } from '@microsoft/rush-lib';

import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';

// These cases start real hosts and run Git/build subprocesses rather than mocked unit work.
jest.setTimeout(30_000);

const message: string = 'rush build: error: Unrecognized arguments: --nope.';
const invalid: string[] = ['build', '--to', 'b', '--nope'];
const usageFailure: object = {
  kind: 'requestResult',
  payload: { exitCode: 2, outcome: 'failure', aborted: false, errorMessage: message }
};
const inProcess: object = { kind: 'requestRejected', payload: { code: 'unsupported', message } };
const success: object = { kind: 'requestResult', payload: { exitCode: 0 } };

it('fails an invalid command line with the exit code of native Rush instead of handing it to in-process Rush', async () => {
  const fixture: DaemonGraphTestFixture = await DaemonGraphTestFixture.createAsync();
  try {
    expect((await fixture.runAsync(invalid)).terminal).toMatchObject(usageFailure);
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
