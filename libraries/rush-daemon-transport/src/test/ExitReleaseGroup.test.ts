// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { once } from 'node:events';
import * as path from 'node:path';
import type { Readable } from 'node:stream';

import { identifyStarted, killStillRunning } from './ProcessWaitFixture';
import type { IStartedProcess } from './ProcessWaitFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;
// A detached process leads its own group, as a daemon that rush-client started does. It checks for children to
// reap before, while and after a child that it spawned into its own group runs.
const GROUP_LEADER_OPTIONS: SpawnOptions = { detached: true, stdio: ['ignore', 'pipe', 'ignore'] };
const GROUP_LEADER_SCRIPT: string = `
const { hasProcessesToReap } = require(process.argv[1]);
const paths = { lockfilePath: process.argv[2] };
const before = hasProcessesToReap(paths);
const child = require('node:child_process').spawn('sleep', ['30'], { stdio: 'ignore' });
child.once('spawn', () => {
  const during = hasProcessesToReap(paths);
  child.once('exit', () => process.stdout.write(JSON.stringify([before, during, hasProcessesToReap(paths)])));
  child.kill('SIGKILL');
});`;

let started: IStartedProcess[] = [];
afterEach(() => {
  killStillRunning(started);
  started = [];
});

linuxIt('finds a child that runs in the daemon process group', async () => {
  const modulePath: string = path.join(__dirname, '..', 'DaemonExitRelease.js');
  const args: string[] = ['-e', GROUP_LEADER_SCRIPT, modulePath, createTestDaemonPaths().lockfilePath];
  const leader: ChildProcess = spawn(process.execPath, args, GROUP_LEADER_OPTIONS);
  await once(leader, 'spawn');
  started = identifyStarted([Number(leader.pid)]);
  const [chunk] = (await once(leader.stdout as Readable, 'data')) as [Buffer];
  expect(JSON.parse(chunk.toString())).toEqual([false, true, false]);
});
