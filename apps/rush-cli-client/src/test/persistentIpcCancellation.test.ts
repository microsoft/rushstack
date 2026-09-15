// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { createPersistentIpcTestFixture, type IPersistentIpcTestFixture } from './PersistentIpcTestFixture';

jest.setTimeout(45_000);

describe('public-client cancellation of an admitted Node operation', () => {
  let activeFixture: IPersistentIpcTestFixture | undefined;
  afterEach(async () => {
    const closing = activeFixture;
    activeFixture = undefined;
    await closing?.closeAsync();
  }, 35_000);

  it('joins already started work and never automatically replays it after cancellation', () => {
    const fixture = createPersistentIpcTestFixture();
    activeFixture = fixture;
    return fixture.runAsync(async () => {
      await fixture.buildAsync('--only', 'a');
      fixture.input('a', { value: 'cancelled-client', delayMs: 1000 });
      const entry = path.resolve(__dirname,
        process.platform === 'win32' ? 'CliSignalTestProcess.js' : '../../bin/rush-client');
      const client = spawn(process.execPath, [entry, 'build', '--only', 'a', '--parallelism', '2', '--verbose'], {
        cwd: fixture.folder,
        env: fixture.environment,
        stdio: process.platform === 'win32' ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe']
      });
      const closed = once(client, 'close');
      fixture.trackWatch(client, closed);
      let stderr = '';
      client.stdout!.resume();
      client.stderr!.setEncoding('utf8');
      client.stderr!.on('data', (text: string) => { stderr += text; });
      try {
        const deadline = Date.now() + 10_000;
        while (!fixture.events().some((event) => event.kind === 'started' && event.iteration === 2)) {
          if (Date.now() >= deadline || client.exitCode !== null || client.signalCode !== null) {
            throw new Error(`The cancellation target did not start: ${stderr}`);
          }
          await delayAsync(10);
        }
        if (process.platform === 'win32') client.send('SIGINT');
        else client.kill('SIGINT');
        // Phased cancellation preserves the daemon's existing aborted-result exit code.
        expect(await closed).toEqual([1, null]);
        expect(stderr).not.toMatch(/using in-process|not retried|timed out/i);
        expect(fixture.events().filter((event) => event.kind === 'ready')).toHaveLength(1);
        expect(fixture.events().filter((event) => event.kind === 'complete')).toHaveLength(2);
        await fixture.buildAsync('--only', 'a');
        expect(fixture.events().filter((event) => event.kind === 'complete')).toHaveLength(2);
      } finally {
        if (client.exitCode === null && client.signalCode === null) client.kill('SIGTERM');
        await closed;
      }
    });
  });
});
