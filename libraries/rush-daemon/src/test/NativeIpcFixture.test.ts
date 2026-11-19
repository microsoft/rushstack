// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import childProcess from 'node:child_process';

import { WarmSetTestFixture } from './WarmSetTestFixture';

describe('explicit Node IPC fixture child', () => {
  let fixture: WarmSetTestFixture | undefined;
  let spawn: jest.SpyInstance | undefined;
  beforeEach(async () => {
    spawn = jest.spyOn(childProcess, 'spawn');
    fixture = await WarmSetTestFixture.createAsync({ ipc: true });
  });
  beforeEach(async () => {
    await fixture!.fixture.buildSuccessfullyAsync();
  });
  afterEach(async () => {
    try {
      await fixture?.[Symbol.asyncDispose]();
    } finally {
      spawn?.mockRestore();
    }
  });

  it('owns the real IPC channel directly, retains native launch context and reuses the process', async () => {
    const launches = spawn!.mock.calls.filter(([, args]) => args?.[0] === 'build.cjs');
    expect(launches).toHaveLength(2);
    for (const [command, args, options] of launches) {
      expect(command).toBe(process.execPath);
      expect(args).toEqual(['build.cjs']);
      expect(options).toMatchObject({
        shell: false,
        env: { INIT_CWD: fixture!.fixture.session.rushConfiguration.commonTempFolder },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc']
      });
    }
    expect(fixture!.operation('a').runner?.isActive).toBe(true);
    expect(fixture!.operation('b').runner?.isActive).toBe(true);
    expect(fixture!.warm.getStatus().measuredRunnerMemoryBytes).toBeGreaterThan(0);
    fixture!.fixture.write('a/input.txt', 'reused');
    await fixture!.fixture.buildSuccessfullyAsync();
    expect(spawn!.mock.calls.filter(([, args]) => args?.[0] === 'build.cjs')).toHaveLength(2);
    expect(fixture!.fixture.runs()).toEqual(['a', 'b', 'a', 'b']);
  });
});
